"""Water column detection and removal for side-scan sonar waterfall data.

Detects first bottom return (altitude boundary) and blanks or aligns samples
so the seabed starts right at the nadir line.
"""

import numpy as np


def detect_first_bottom_return(
    ping_samples: np.ndarray,
    altitude: float,
    slant_range: float,
    threshold_factor: float = 2.5,
) -> int:
    """Detect sample index corresponding to the first seabed bottom arrival.

    Args:
        ping_samples: 1D array of acoustic backscatter intensity for one ping.
        altitude: Expected towfish altitude in metres.
        slant_range: Max swath range in metres.
        threshold_factor: Multiplier above background noise to confirm seabed echo.

    Returns:
        Integer sample index of the detected seabed boundary.
    """
    n_samples = len(ping_samples)
    if n_samples == 0:
        return 0

    # Expected index based on altitude geometry
    expected_frac = min(1.0, max(0.0, altitude / max(1e-3, slant_range)))
    expected_idx = int(expected_frac * n_samples)

    if expected_idx <= 0:
        return 0

    # Search in a window around expected altitude for sharp gradient/amplitude jump
    window_start = max(0, int(expected_idx * 0.7))
    window_end = min(n_samples - 1, int(expected_idx * 1.4) + 10)

    if window_end <= window_start:
        return expected_idx

    search_region = ping_samples[window_start:window_end]
    if len(search_region) == 0:
        return expected_idx

    # Noise baseline from initial water column
    noise_baseline = np.median(ping_samples[: max(1, window_start)]) + 1e-5
    strong_returns = np.where(search_region > noise_baseline * threshold_factor)[0]

    if len(strong_returns) > 0:
        return window_start + int(strong_returns[0])

    return expected_idx


def strip_water_column(
    ping_samples: np.ndarray | list[float],
    altitude: float,
    slant_range: float = 60.0,
) -> np.ndarray:
    """Strip the water column portion from a 1D ping, returning seabed samples.

    Args:
        ping_samples: Raw echo intensity time series from one ping.
        altitude: Towfish altitude in metres.
        slant_range: Swath slant range in metres.

    Returns:
        1D numpy array with water column cropped and resampled to original length.
    """
    arr = np.asarray(ping_samples, dtype=np.float32)
    if len(arr) == 0:
        return arr

    fbr_idx = detect_first_bottom_return(arr, altitude, slant_range)
    if fbr_idx >= len(arr) - 5:
        return arr

    seabed_portion = arr[fbr_idx:]
    # Resample back to original length
    orig_len = len(arr)
    indices = np.linspace(0, len(seabed_portion) - 1, orig_len)
    idx_floor = np.floor(indices).astype(int)
    idx_ceil = np.clip(idx_floor + 1, 0, len(seabed_portion) - 1)
    weight = indices - idx_floor

    return (1.0 - weight) * seabed_portion[idx_floor] + weight * seabed_portion[idx_ceil]


def strip_waterfall_water_column(
    waterfall: np.ndarray,
    altitudes: np.ndarray | list[float],
    slant_range: float = 60.0,
) -> np.ndarray:
    """Strip water column row-by-row across an entire waterfall channel.

    Args:
        waterfall: 2D numpy array [pings, samples].
        altitudes: Altitude per ping.
        slant_range: Max swath range.

    Returns:
        2D numpy array of seabed backscatter without water column gap.
    """
    if waterfall.ndim != 2 or waterfall.shape[0] == 0:
        return waterfall

    n_pings, n_samples = waterfall.shape
    cleaned = np.zeros_like(waterfall, dtype=np.float32)

    alts = np.asarray(altitudes, dtype=np.float32)
    if len(alts) < n_pings:
        mean_alt = float(np.mean(alts)) if len(alts) > 0 else 5.0
        alts = np.pad(alts, (0, n_pings - len(alts)), constant_values=mean_alt)

    for i in range(n_pings):
        cleaned[i] = strip_water_column(waterfall[i], float(alts[i]), slant_range)

    return cleaned
