"""Slant-range to ground-range conversion and geometric correction.

Equation:
    Ground_Range = sqrt(max(0, Slant_Range^2 - Altitude^2))

Maps acoustic sample bins from radial slant range to horizontal ground distance
across the seabed.
"""

import numpy as np


def slant_to_ground(slant_range: float, altitude: float) -> float:
    """Convert a single slant range value to horizontal ground range (metres).

    Args:
        slant_range: Raw slant range distance (metres).
        altitude:    Towfish altitude above seabed (metres).

    Returns:
        Horizontal ground range in metres.
    """
    if slant_range <= altitude or altitude <= 0:
        return 0.0
    return float(np.sqrt(max(0.0, slant_range**2 - altitude**2)))


def correct_ping_slant_range(
    samples: np.ndarray,
    altitude: float,
    max_slant_range: float,
    num_output_bins: int | None = None,
) -> np.ndarray:
    """Resample a 1D ping channel from slant range to uniform ground range.

    Args:
        samples: 1D array of acoustic backscatter intensity samples.
        altitude: Towfish altitude above seabed (metres).
        max_slant_range: Maximum swath range for this ping (metres).
        num_output_bins: Number of output ground range bins (defaults to len(samples)).

    Returns:
        1D numpy array resampled into linear horizontal ground distance bins.
    """
    n_samples = len(samples)
    if n_samples == 0:
        return np.array([], dtype=np.float32)

    if num_output_bins is None:
        num_output_bins = n_samples

    # Max ground range achievable at this altitude
    if max_slant_range <= altitude:
        max_ground_range = max_slant_range
    else:
        max_ground_range = np.sqrt(max_slant_range**2 - altitude**2)

    # Linear ground range bins
    ground_ranges = np.linspace(0.0, max_ground_range, num_output_bins, dtype=np.float32)

    # Convert ground ranges back to required slant ranges
    req_slant_ranges = np.sqrt(ground_ranges**2 + altitude**2)

    # Map slant ranges to fractional indices in original sample array
    slant_indices = (req_slant_ranges / max(1e-3, max_slant_range)) * (n_samples - 1)
    slant_indices = np.clip(slant_indices, 0, n_samples - 1)

    # Linear interpolation
    idx_floor = np.floor(slant_indices).astype(int)
    idx_ceil = np.clip(idx_floor + 1, 0, n_samples - 1)
    weight = slant_indices - idx_floor

    return (1.0 - weight) * samples[idx_floor] + weight * samples[idx_ceil]


def correct_waterfall_slant_range(
    waterfall: np.ndarray,
    altitudes: np.ndarray | list[float],
    max_slant_range: float,
) -> np.ndarray:
    """Apply slant-to-ground geometric correction row-by-row to a waterfall array.

    Args:
        waterfall: 2D numpy array [pings, samples] (e.g. port or starboard side).
        altitudes: 1D array of towfish altitude per ping.
        max_slant_range: Maximum swath slant range (metres).

    Returns:
        2D numpy array corrected for slant-range distortion.
    """
    if waterfall.ndim != 2 or waterfall.shape[0] == 0:
        return waterfall

    n_pings, n_samples = waterfall.shape
    corrected = np.zeros_like(waterfall, dtype=np.float32)

    alts = np.asarray(altitudes, dtype=np.float32)
    if len(alts) < n_pings:
        mean_alt = float(np.mean(alts)) if len(alts) > 0 else 5.0
        alts = np.pad(alts, (0, n_pings - len(alts)), constant_values=mean_alt)

    for i in range(n_pings):
        corrected[i] = correct_ping_slant_range(
            waterfall[i],
            altitude=float(alts[i]),
            max_slant_range=max_slant_range,
            num_output_bins=n_samples,
        )

    return corrected
