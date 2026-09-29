"""Acoustic processing modules for side-scan sonar data."""

from app.pipeline.acoustic.denoise import (
    DenoiseConfig,
    beam_pattern_correction,
    clip_spikes,
    condition_channel,
    despeckle,
    destripe,
    lee_filter,
    precondition_channel,
    repair_bad_pings,
)
from app.pipeline.acoustic.gain_correction import apply_tvg, normalize_waterfall_contrast
from app.pipeline.acoustic.slant_range import correct_ping_slant_range, correct_waterfall_slant_range, slant_to_ground
from app.pipeline.acoustic.tiling import TileMetadata, tile_xtf_waterfall
from app.pipeline.acoustic.water_column import (
    detect_first_bottom_return,
    strip_water_column,
    strip_waterfall_water_column,
)
from app.pipeline.acoustic.xtf_processor import XtfNavigationPoint, XtfProcessor, XtfSurveyData

__all__ = [
    "DenoiseConfig",
    "repair_bad_pings",
    "clip_spikes",
    "beam_pattern_correction",
    "destripe",
    "lee_filter",
    "despeckle",
    "precondition_channel",
    "condition_channel",
    "apply_tvg",
    "normalize_waterfall_contrast",
    "slant_to_ground",
    "correct_ping_slant_range",
    "correct_waterfall_slant_range",
    "detect_first_bottom_return",
    "strip_water_column",
    "strip_waterfall_water_column",
    "TileMetadata",
    "tile_xtf_waterfall",
    "XtfNavigationPoint",
    "XtfProcessor",
    "XtfSurveyData",
]
