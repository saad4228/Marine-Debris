"""Water column detection and removal.

TODO: Implement first-bottom-return detection to strip water-column
samples between the towfish and the seabed.
"""


def strip_water_column(ping_samples: list[float], altitude: float) -> list[float]:
    """Remove water-column samples from a sonar ping.

    Args:
        ping_samples: Raw echo intensity time series from one ping.
        altitude:     Towfish altitude (metres) — determines how many
                      leading samples are water column.

    Returns:
        Ping samples with water-column portion removed.

    TODO: Replace stub — currently returns samples unchanged.
    """
    return ping_samples
