"""Time-varied gain (TVG), beam-pattern normalisation, and contrast equalization.

Acoustic transmission loss equation:
    TL = 20 * log10(R) + 2 * alpha * R
Applies range compensation gain so that targets at far range have comparable
intensity and signal-to-noise ratio to targets near nadir.
"""

import numpy as np


def apply_tvg(
    ping_samples: np.ndarray | list[float],
    range_start: float = 1.0,
    sample_spacing: float = 0.05,
    absorption_db_per_km: float = 60.0,
    spreading_exponent: float = 2.0,
) -> np.ndarray:
    """Apply time-varied gain correction to a 1D ping.

    Args:
        ping_samples: 1D array of echo intensity values.
        range_start: Ground/slant range of first sample (metres).
        sample_spacing: Distance between consecutive samples (metres).
        absorption_db_per_km: Acoustic attenuation absorption coefficient.
        spreading_exponent: Spherical/cylindrical spreading geometric loss factor (1.5 - 2.5).

    Returns:
        Gain-corrected 1D numpy array.
    """
    arr = np.asarray(ping_samples, dtype=np.float32)
    n = len(arr)
    if n == 0:
        return arr

    ranges = np.maximum(0.5, range_start + np.arange(n, dtype=np.float32) * sample_spacing)

    # Transmission loss correction factor
    # Spreading: (R / R0)^exponent
    # Absorption: 10^(alpha * (R - R0) / 10000)
    alpha = absorption_db_per_km / 1000.0  # dB/m
    spreading = (ranges / ranges[0]) ** (spreading_exponent * 0.5)
    absorption = 10.0 ** (alpha * (ranges - ranges[0]) / 20.0)

    gain_curve = np.clip(spreading * absorption, 1.0, 50.0)
    corrected = arr * gain_curve
    return corrected


def normalize_waterfall_contrast(
    waterfall: np.ndarray,
    percentile_low: float = 2.0,
    percentile_high: float = 98.0,
) -> np.ndarray:
    """Normalize waterfall image values to 0..255 uint8 range for image tiling.

    Args:
        waterfall: 2D numpy array [pings, samples].
        percentile_low: Lower percentile for background black level clipping.
        percentile_high: Upper percentile for specular acoustic highlight clipping.

    Returns:
        2D uint8 numpy array in range 0..255.
    """
    if waterfall.size == 0:
        return np.zeros((0, 0), dtype=np.uint8)

    arr = np.asarray(waterfall, dtype=np.float32)
    p_low = float(np.percentile(arr, percentile_low))
    p_high = float(np.percentile(arr, percentile_high))

    if p_high <= p_low:
        p_high = p_low + 1e-3

    clipped = np.clip(arr, p_low, p_high)
    normalized = ((clipped - p_low) / (p_high - p_low) * 255.0).astype(np.uint8)
    return normalized
