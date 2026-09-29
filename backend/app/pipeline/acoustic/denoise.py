"""Acoustic denoising and radiometric conditioning for side-scan sonar waterfalls.

Runs between XTF extraction and JPG tiling: repairs corrupt pings, clips electrical
spikes, flattens the transducer beam pattern across-track, removes ping-to-ping
banding along-track, and suppresses multiplicative speckle — so the detector sees a
flat, evenly-lit seabed instead of sensor artefacts.

Stage order inside XtfProcessor._build_survey_data:

    parse XTF
      -> precondition_channel   (bad-ping repair + spike clipping)      [this module]
      -> water-column removal
      -> slant-to-ground correction
      -> condition_channel      (beam pattern + destripe + despeckle)   [this module]
      -> port/starboard compositing + contrast normalisation
      -> 640x640 JPG tiling -> YOLO inference

Preconditioning runs on raw backscatter (before geometry) because spikes and dead
pings would otherwise corrupt the nadir search. Radiometric flattening and speckle
suppression run after geometry, per channel, so the across-track gain profile is
measured against true ground range and the port/starboard seam is never smeared.

Unlike a generic denoiser this stage never drops pings: every waterfall row is
indexed against an XtfNavigationPoint to georeference detections, so a bad ping is
interpolated from its neighbours rather than removed.

Despeckling accepts an ordered chain ("lee+bilateral"), because the deployed weights
were trained on tiles filtered that way — Lee to suppress multiplicative speckle, then
bilateral to flatten the residue while preserving target/shadow edges. Inference has to
reproduce that order or the model sees different image statistics than it was trained on.

SciPy is optional. Without it the module falls back to pure-NumPy box/gaussian
filters and the 'median' despeckle mode degrades to 'lee'. The 'bilateral', 'nlm'
and 'wavelet' modes need opencv-python / scikit-image respectively and fall back to
'lee' when those are absent.
"""

from dataclasses import dataclass
import logging
import warnings

import numpy as np

logger = logging.getLogger("nadir.pipeline.denoise")

try:
    from scipy.ndimage import gaussian_filter1d as _scipy_gaussian1d, median_filter as _scipy_median
    from scipy.ndimage import uniform_filter as _scipy_uniform

    HAS_SCIPY = True
except ImportError:  # pragma: no cover - exercised only on minimal installs
    _scipy_gaussian1d = _scipy_median = _scipy_uniform = None
    HAS_SCIPY = False


DESPECKLE_METHODS = ("lee", "median", "bilateral", "nlm", "wavelet", "none")


@dataclass
class DenoiseConfig:
    """Denoising parameters. Defaults suit 100–900 kHz side-scan sonars."""

    enabled: bool = True

    # Bad-data repair (pre-geometry)
    repair_bad_pings: bool = True
    bad_ping_mad: float = 6.0        # ping repaired if |mean - median| > k * MAD
    clip_spikes: bool = True
    spike_percentile: float = 99.9   # samples above this are clipped (saturation/dropouts)

    # Radiometric flattening (post-geometry)
    beam_pattern_correction: bool = True   # across-track: beam pattern + TVG residual
    destripe: bool = True                  # along-track: ping-to-ping gain jitter
    profile_smooth: float = 9.0            # gaussian sigma for the gain profiles

    # Speckle suppression. One filter ("lee") or an ordered chain ("lee+bilateral").
    # The current weights were trained on Lee-then-bilateral filtered tiles, so this
    # default reproduces the training pipeline; changing it changes what the model sees.
    despeckle: str = "lee+bilateral"
    filter_size: int = 5             # window for lee / median
    log_domain: bool = True          # denoise in log space (speckle is multiplicative)


# --------------------------------------------------------------------------- #
# NumPy fallbacks so the pipeline still runs on a minimal install
# --------------------------------------------------------------------------- #
def _box_mean(img: np.ndarray, size: int) -> np.ndarray:
    """Separable box mean over a 2D array with reflected edges (uniform_filter).

    NumPy's "symmetric" padding is the equivalent of SciPy's default "reflect" mode
    (both repeat the edge sample), so the fallback matches ``uniform_filter`` at the
    borders instead of drifting from it.
    """
    if size < 2:
        return img.astype(np.float32)
    if HAS_SCIPY:
        return _scipy_uniform(img.astype(np.float32), size=size)

    k = int(size)
    lo = k // 2
    hi = k - 1 - lo
    pad = np.pad(img.astype(np.float64), ((lo, hi), (lo, hi)), mode="symmetric")

    csum = np.cumsum(pad, axis=0)
    csum = np.vstack([np.zeros((1, csum.shape[1])), csum])
    rows = csum[k:, :] - csum[:-k, :]

    csum = np.cumsum(rows, axis=1)
    csum = np.hstack([np.zeros((csum.shape[0], 1)), csum])
    cols = csum[:, k:] - csum[:, :-k]

    return (cols / float(k * k)).astype(np.float32)


def _smooth_profile(profile: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian-smooth a 1D gain profile with reflected edges."""
    if sigma <= 0 or profile.size < 3:
        return profile.astype(np.float32)
    if HAS_SCIPY:
        return _scipy_gaussian1d(profile.astype(np.float32), sigma=sigma)

    radius = max(1, int(4.0 * sigma + 0.5))
    x = np.arange(-radius, radius + 1, dtype=np.float64)
    kernel = np.exp(-(x**2) / (2.0 * sigma * sigma))
    kernel /= kernel.sum()

    pad = np.pad(profile.astype(np.float64), radius, mode="symmetric")
    smoothed = np.convolve(pad, kernel, mode="same")
    return smoothed[radius : radius + profile.size].astype(np.float32)


def _nan_median(masked: np.ndarray, axis: int) -> np.ndarray:
    """np.nanmedian without the all-NaN slice warning; empty slices become NaN."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmedian(masked, axis=axis)


# --------------------------------------------------------------------------- #
# 1. Bad-data repair (runs on raw backscatter, before geometry)
# --------------------------------------------------------------------------- #
def repair_bad_pings(waterfall: np.ndarray, cfg: DenoiseConfig) -> np.ndarray:
    """Replace blank / wildly off-gain pings with an interpolation of their neighbours.

    A ping is bad if it is entirely empty, or if its mean intensity deviates from the
    survey median by more than ``bad_ping_mad`` median-absolute-deviations. Bad rows are
    rebuilt by linear blending of the nearest good rows above and below, so the row count
    (and therefore alignment with the navigation track) is preserved exactly.

    Args:
        waterfall: 2D array [pings, samples] of raw backscatter for one channel.
        cfg: Active denoise configuration.

    Returns:
        2D float32 array of the same shape with bad pings rebuilt.
    """
    if waterfall.ndim != 2 or waterfall.shape[0] < 3:
        return waterfall.astype(np.float32)

    chan = np.nan_to_num(waterfall.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    ping_mean = chan.mean(axis=1)
    good = ping_mean > 0

    if good.sum() >= 10:
        med = float(np.median(ping_mean[good]))
        mad = float(np.median(np.abs(ping_mean[good] - med))) + 1e-9
        good &= np.abs(ping_mean - med) < cfg.bad_ping_mad * mad

    bad_idx = np.flatnonzero(~good)
    good_idx = np.flatnonzero(good)

    if bad_idx.size == 0 or good_idx.size == 0:
        if good_idx.size == 0:
            logger.warning("Every ping failed the quality test; leaving channel untouched.")
        return chan

    # Nearest good row on each side of every bad row
    pos = np.searchsorted(good_idx, bad_idx)
    lo_row = good_idx[np.clip(pos - 1, 0, good_idx.size - 1)]
    hi_row = good_idx[np.clip(pos, 0, good_idx.size - 1)]

    span = (hi_row - lo_row).astype(np.float32)
    weight = np.where(span > 0, (bad_idx - lo_row) / np.maximum(span, 1e-6), 0.0)

    chan[bad_idx] = (1.0 - weight)[:, None] * chan[lo_row] + weight[:, None] * chan[hi_row]

    logger.debug("Repaired %d/%d bad pings", bad_idx.size, chan.shape[0])
    return chan


def clip_spikes(waterfall: np.ndarray, cfg: DenoiseConfig) -> np.ndarray:
    """Clip saturated samples and electrical spikes above a high percentile."""
    positive = waterfall[waterfall > 0]
    if positive.size == 0:
        return waterfall
    ceiling = float(np.percentile(positive, cfg.spike_percentile))
    if ceiling <= 0:
        return waterfall
    return np.clip(waterfall, 0.0, ceiling)


# --------------------------------------------------------------------------- #
# 2. Radiometric flattening (runs after slant-range correction)
# --------------------------------------------------------------------------- #
def beam_pattern_correction(waterfall: np.ndarray, cfg: DenoiseConfig) -> np.ndarray:
    """Flatten the across-track gain profile (beam pattern + imperfect TVG).

    Divides every ping by the survey-wide median intensity of each across-track bin, so
    the bright nadir and the dark far range even out. The median across pings is used so
    genuine targets cannot bias the profile, and blanked samples are excluded.

    Args:
        waterfall: 2D array [pings, samples] for one channel.
        cfg: Active denoise configuration.

    Returns:
        2D float32 array with the across-track gain profile removed.
    """
    if waterfall.ndim != 2 or waterfall.size == 0:
        return waterfall

    valid = waterfall > 0
    if not valid.any():
        return waterfall

    profile = _nan_median(np.where(valid, waterfall, np.nan), axis=0)
    profile = np.nan_to_num(profile, nan=0.0)
    profile = _smooth_profile(profile, cfg.profile_smooth)

    reference = float(np.median(profile[profile > 0])) if np.any(profile > 0) else 1.0
    profile = np.where(profile > 0, profile, 1.0)

    return (waterfall / profile[None, :] * reference).astype(np.float32)


def destripe(waterfall: np.ndarray, cfg: DenoiseConfig) -> np.ndarray:
    """Remove along-track banding caused by ping-to-ping gain jitter.

    The along-track counterpart of :func:`beam_pattern_correction`: each ping is divided
    by its own smoothed median intensity, flattening the horizontal stripes that survive
    across-track normalisation.

    Args:
        waterfall: 2D array [pings, samples] for one channel.
        cfg: Active denoise configuration.

    Returns:
        2D float32 array with ping-to-ping banding removed.
    """
    if waterfall.ndim != 2 or waterfall.size == 0:
        return waterfall

    valid = waterfall > 0
    if not valid.any():
        return waterfall

    profile = _nan_median(np.where(valid, waterfall, np.nan), axis=1)
    profile = np.nan_to_num(profile, nan=0.0)
    profile = _smooth_profile(profile, cfg.profile_smooth)

    reference = float(np.median(profile[profile > 0])) if np.any(profile > 0) else 1.0
    profile = np.where(profile > 0, profile, 1.0)

    return (waterfall / profile[:, None] * reference).astype(np.float32)


# --------------------------------------------------------------------------- #
# 3. Speckle suppression
# --------------------------------------------------------------------------- #
def lee_filter(img: np.ndarray, size: int = 5) -> np.ndarray:
    """Classic Lee filter — smooths flat seabed while preserving target and shadow edges.

    Blends each pixel toward its local mean in proportion to how uniform the neighbourhood
    is, so homogeneous sediment is smoothed hard and high-variance regions (a target
    highlight against its acoustic shadow) are left almost intact.

    Args:
        img: 2D array to filter.
        size: Square window size in pixels.

    Returns:
        2D float32 filtered array.
    """
    arr = img.astype(np.float32)
    local_mean = _box_mean(arr, size)
    local_sq_mean = _box_mean(arr * arr, size)
    local_var = np.maximum(local_sq_mean - local_mean * local_mean, 0.0)

    overall_var = float(np.var(arr))
    weight = local_var / (local_var + overall_var + 1e-9)

    return (local_mean + weight * (arr - local_mean)).astype(np.float32)


def _apply_single_filter(work: np.ndarray, method: str, cfg: DenoiseConfig) -> np.ndarray:
    """Run one despeckle filter over an array already in the working (log) domain."""
    try:
        if method == "lee":
            return lee_filter(work, cfg.filter_size)

        if method == "median":
            if not HAS_SCIPY:
                raise ImportError("scipy is required for median despeckling")
            return _scipy_median(work, size=cfg.filter_size)

        if method == "bilateral":
            import cv2

            # sigmaColor/sigmaSpace of 50: strong enough to flatten residual speckle,
            # narrow enough that a target edge against its acoustic shadow survives.
            return cv2.bilateralFilter(work.astype(np.float32), cfg.filter_size, 50, 50)

        if method == "nlm":
            from skimage.restoration import denoise_nl_means, estimate_sigma

            sigma = float(np.mean(estimate_sigma(work)))
            return denoise_nl_means(
                work, h=1.15 * sigma, sigma=sigma, fast_mode=True, patch_size=5, patch_distance=6
            )

        # wavelet
        from skimage.restoration import denoise_wavelet

        return denoise_wavelet(work, method="BayesShrink", mode="soft", rescale_sigma=True)

    except ImportError as exc:
        logger.warning("Despeckle backend '%s' unavailable (%s); using Lee filter.", method, exc)
        return lee_filter(work, cfg.filter_size)


def parse_despeckle_chain(spec: str | None) -> list[str]:
    """Parse a despeckle spec into an ordered list of filters.

    Accepts a single method ("lee") or a chain ("lee+bilateral", "lee,bilateral").
    Order is significant and preserved: the training pipeline for the current weights
    applied Lee first to suppress multiplicative speckle, then bilateral to flatten what
    remained while keeping target/shadow edges. Inference must reproduce that order or the
    model sees a different image statistic than it was trained on.
    """
    if not spec:
        return []
    parts = [p.strip().lower() for p in spec.replace(",", "+").split("+")]
    chain = []
    for part in parts:
        if not part or part == "none":
            continue
        if part not in DESPECKLE_METHODS:
            logger.warning("Unknown despeckle method '%s'; skipping it.", part)
            continue
        chain.append(part)
    return chain


def despeckle(waterfall: np.ndarray, cfg: DenoiseConfig) -> np.ndarray:
    """Suppress multiplicative speckle using the configured filter or filter chain.

    Sonar speckle is multiplicative, so filtering is done in the log domain by default
    (``log_domain``), which turns it into additive noise the linear filters can remove
    cleanly. The log/exp transform wraps the WHOLE chain rather than each filter, so a
    two-stage chain is not repeatedly compressed and expanded.

    ``cfg.despeckle`` may name one filter ("lee") or several ("lee+bilateral"), applied
    left to right. Unavailable backends degrade to the Lee filter rather than failing.

    Args:
        waterfall: 2D array [pings, samples] for one channel.
        cfg: Active denoise configuration.

    Returns:
        2D float32 despeckled array.
    """
    chain = parse_despeckle_chain(cfg.despeckle)
    if not chain or waterfall.size == 0:
        return waterfall

    arr = np.maximum(waterfall.astype(np.float32), 0.0)
    work = np.log1p(arr) if cfg.log_domain else arr

    for method in chain:
        work = _apply_single_filter(work, method, cfg)

    result = np.expm1(work) if cfg.log_domain else work
    return np.maximum(result, 0.0).astype(np.float32)


# --------------------------------------------------------------------------- #
# 4. Stage entry points used by XtfProcessor
# --------------------------------------------------------------------------- #
def precondition_channel(waterfall: np.ndarray, cfg: DenoiseConfig, label: str = "channel") -> np.ndarray:
    """Pre-geometry cleaning: repair bad pings and clip spikes.

    Must run before nadir detection and slant-range correction, since a saturated or dead
    ping would otherwise drag the detected first-bottom-return off the true seabed.

    Args:
        waterfall: 2D raw backscatter array [pings, samples].
        cfg: Active denoise configuration.
        label: Channel name used in log messages.

    Returns:
        2D float32 array of the same shape.
    """
    if not cfg.enabled or waterfall.ndim != 2 or waterfall.size == 0:
        return waterfall

    out = np.nan_to_num(waterfall.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)

    if cfg.repair_bad_pings:
        out = repair_bad_pings(out, cfg)
    if cfg.clip_spikes:
        out = clip_spikes(out, cfg)

    logger.debug("[%s] preconditioned %s", label, out.shape)
    return out


def condition_channel(waterfall: np.ndarray, cfg: DenoiseConfig, label: str = "channel") -> np.ndarray:
    """Post-geometry conditioning: beam pattern, destripe, despeckle.

    Runs per channel before the port/starboard halves are joined, so each transducer's own
    gain profile is removed and the despeckle window never straddles the nadir seam.

    Args:
        waterfall: 2D slant-corrected array [pings, samples] for one channel.
        cfg: Active denoise configuration.
        label: Channel name used in log messages.

    Returns:
        2D float32 array of the same shape, ready for compositing and contrast stretch.
    """
    if not cfg.enabled or waterfall.ndim != 2 or waterfall.size == 0:
        return waterfall

    out = waterfall.astype(np.float32)

    if cfg.beam_pattern_correction:
        out = beam_pattern_correction(out, cfg)
    if cfg.destripe:
        out = destripe(out, cfg)

    out = despeckle(out, cfg)

    logger.debug("[%s] conditioned %s (despeckle=%s)", label, out.shape, cfg.despeckle)
    return out
