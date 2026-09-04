"""Time-varied gain (TVG) and beam-pattern normalisation.

TODO: Implement TVG correction so that echo intensity is range-independent.
Typical correction: intensity_corrected = intensity * range^n  (n ≈ 2–3)
"""


def apply_tvg(ping_samples: list[float], range_start: float, sample_spacing: float) -> list[float]:
    """Apply time-varied gain correction to a ping.

    Args:
        ping_samples:   Echo intensity values.
        range_start:    Ground range of the first sample (metres).
        sample_spacing: Distance between consecutive samples (metres).

    Returns:
        Gain-corrected samples.

    TODO: Replace stub — currently returns samples unchanged.
    """
    return ping_samples
