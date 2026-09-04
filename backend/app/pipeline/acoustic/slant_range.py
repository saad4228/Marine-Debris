"""Slant-range to ground-range conversion.

TODO: Implement using towfish altitude from XTF ping headers.
Formula: ground_range = sqrt(slant_range^2 - altitude^2)
"""


def slant_to_ground(slant_range: float, altitude: float) -> float:
    """Convert slant range to ground range.

    Args:
        slant_range: Raw slant range from the sonar ping (metres).
        altitude:    Towfish altitude above the seabed (metres).

    Returns:
        Ground range in metres.

    TODO: Replace stub with real implementation once XTF parsing is in place.
    """
    if slant_range <= altitude:
        return 0.0
    return (slant_range**2 - altitude**2) ** 0.5
