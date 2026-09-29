"""Unit tests for the acoustic denoising stage."""

import numpy as np
import pytest

from app.pipeline.acoustic.denoise import (
    DESPECKLE_METHODS,
    DenoiseConfig,
    beam_pattern_correction,
    clip_spikes,
    condition_channel,
    despeckle,
    destripe,
    precondition_channel,
    repair_bad_pings,
)
from app.pipeline.acoustic.xtf_processor import XtfProcessor

N_PINGS = 240
N_SAMPLES = 512


def _dirty_channel(seed: int = 7) -> np.ndarray:
    """Synthetic channel with a beam pattern, banding, speckle, dead pings and a spike."""
    rng = np.random.default_rng(seed)

    beam = 40 + 90 * np.exp(-np.linspace(0, 3, N_SAMPLES))          # bright nadir, dark far range
    chan = np.tile(beam, (N_PINGS, 1)).astype(np.float32)
    chan *= (1 + 0.25 * np.sin(np.arange(N_PINGS) / 7.0))[:, None]  # along-track banding
    chan = chan * rng.gamma(shape=4.0, scale=0.25, size=chan.shape).astype(np.float32)

    # A target: bright highlight followed by its acoustic shadow
    chan[150:158, 300:308] += 220.0
    chan[150:158, 308:330] = 2.0

    chan[40] = 0.0              # dead ping
    chan[120] = 9000.0          # saturated ping
    chan[200, 100:110] = 60000.0  # electrical spike
    return chan


def _across_track_spread(arr: np.ndarray) -> float:
    col_means = arr.mean(axis=0)
    return float(col_means.std() / (col_means.mean() + 1e-9))


def _along_track_spread(arr: np.ndarray) -> float:
    row_means = arr.mean(axis=1)
    return float(row_means.std() / (row_means.mean() + 1e-9))


def test_repair_bad_pings_preserves_row_count():
    """Bad pings must be interpolated, never dropped — rows map 1:1 to nav points."""
    dirty = _dirty_channel()
    repaired = repair_bad_pings(dirty, DenoiseConfig())

    assert repaired.shape == dirty.shape
    assert repaired[40].mean() > 10.0, "dead ping was not rebuilt"
    assert repaired[120].mean() < 5000.0, "saturated ping was not rebuilt"


def test_repair_bad_pings_leaves_clean_data_alone():
    clean = np.full((50, 64), 100.0, dtype=np.float32)
    assert np.allclose(repair_bad_pings(clean, DenoiseConfig()), clean)


def test_repair_bad_pings_survives_all_bad_channel():
    blank = np.zeros((30, 64), dtype=np.float32)
    assert repair_bad_pings(blank, DenoiseConfig()).shape == blank.shape


def test_clip_spikes_removes_saturation():
    dirty = _dirty_channel()
    clipped = clip_spikes(dirty, DenoiseConfig())

    assert clipped.max() < dirty.max()
    assert clipped.shape == dirty.shape


def test_beam_pattern_correction_flattens_across_track():
    dirty = _dirty_channel()
    corrected = beam_pattern_correction(dirty, DenoiseConfig())

    assert _across_track_spread(corrected) < _across_track_spread(dirty)


def test_destripe_flattens_along_track():
    dirty = _dirty_channel()
    corrected = destripe(dirty, DenoiseConfig())

    assert _along_track_spread(corrected) < _along_track_spread(dirty)


def test_despeckle_smooths_seabed_but_keeps_target_contrast():
    conditioned = condition_channel(precondition_channel(_dirty_channel(), DenoiseConfig()), DenoiseConfig())
    raw = precondition_channel(_dirty_channel(), DenoiseConfig())

    def speckle_cv(arr):
        patch = arr[210:238, 400:460]
        return float(patch.std() / (patch.mean() + 1e-9))

    assert speckle_cv(conditioned) < speckle_cv(raw), "speckle was not suppressed"

    highlight = conditioned[150:158, 300:308].mean()
    shadow = conditioned[150:158, 310:328].mean()
    assert highlight / (shadow + 1e-9) > 5.0, "Lee filter smeared the target into its shadow"


@pytest.mark.parametrize("method", DESPECKLE_METHODS + ("not_a_real_method",))
def test_despeckle_never_raises_on_missing_backend(method):
    """Unavailable backends must fall back to Lee, not fail the upload."""
    patch = _dirty_channel()[:64, :64]
    out = despeckle(patch, DenoiseConfig(despeckle=method))

    assert out.shape == patch.shape
    assert np.isfinite(out).all()


def test_disabled_config_is_passthrough():
    dirty = _dirty_channel()
    off = DenoiseConfig(enabled=False)

    assert np.array_equal(precondition_channel(dirty, off), dirty)
    assert np.array_equal(condition_channel(dirty, off), dirty)


@pytest.mark.parametrize(
    "array",
    [
        np.zeros((0, 0), dtype=np.float32),
        np.zeros((4, 4), dtype=np.float32),
        np.full((8, 8), np.nan, dtype=np.float32),
    ],
)
def test_degenerate_inputs_are_handled(array):
    cfg = DenoiseConfig()
    assert precondition_channel(array, cfg).shape == array.shape
    assert condition_channel(array, cfg).shape == array.shape


def test_processor_denoises_by_default():
    assert XtfProcessor().denoise.enabled is True


@pytest.mark.parametrize("enabled", [True, False])
def test_waterfall_stays_aligned_with_navigation(enabled):
    """One waterfall row per nav point, or every detection is mis-georeferenced."""
    processor = XtfProcessor(denoise=DenoiseConfig(enabled=enabled))
    survey = processor._generate_synthetic_survey("survey_test.xtf", "TestSonar")

    assert survey.waterfall_composite.shape[0] == len(survey.nav_points) == survey.total_pings
    assert survey.waterfall_composite.dtype == np.uint8


# --- filter chaining -------------------------------------------------------
# The deployed weights were trained on Lee-then-bilateral filtered tiles, so the chain
# and its ORDER are part of the model contract, not a tuning preference.

@pytest.mark.parametrize(
    "spec,expected",
    [
        ("lee+bilateral", ["lee", "bilateral"]),
        ("lee, bilateral", ["lee", "bilateral"]),
        ("bilateral+lee", ["bilateral", "lee"]),   # order is preserved, not normalised
        ("lee", ["lee"]),
        ("none", []),
        ("", []),
        (None, []),
        ("lee+bogus+bilateral", ["lee", "bilateral"]),  # unknown members dropped, rest kept
    ],
)
def test_parse_despeckle_chain(spec, expected):
    from app.pipeline.acoustic.denoise import parse_despeckle_chain

    assert parse_despeckle_chain(spec) == expected


def test_chain_applies_every_filter_in_order():
    """A chain must actually smooth more than its first element alone."""
    dirty = _dirty_channel()
    pre = precondition_channel(dirty, DenoiseConfig())

    def speckle_cv(arr):
        patch = arr[210:238, 400:460]
        return float(patch.std() / (patch.mean() + 1e-9))

    lee_only = despeckle(pre, DenoiseConfig(despeckle="lee"))
    chained = despeckle(pre, DenoiseConfig(despeckle="lee+bilateral"))

    assert speckle_cv(chained) < speckle_cv(lee_only), "bilateral stage had no effect"
    assert chained.shape == pre.shape
    assert np.isfinite(chained).all()


def test_configured_default_matches_the_trained_pipeline():
    """Guard the model contract: the shipped default must stay lee -> bilateral."""
    from app.pipeline.acoustic.denoise import parse_despeckle_chain

    assert parse_despeckle_chain(DenoiseConfig().despeckle) == ["lee", "bilateral"]
