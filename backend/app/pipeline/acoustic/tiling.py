"""Waterfall tiling engine.

TODO: Implement overlapping tile extraction from corrected waterfall images.
Each tile must retain its ping range, side (port/starboard), and towfish altitude.
Overlap must exceed the largest expected target + shadow length.
"""

from dataclasses import dataclass


@dataclass
class Tile:
    """A single tile extracted from the waterfall."""
    data: bytes         # Raw image bytes of the tile
    ping_start: int     # First ping index in this tile
    ping_end: int       # Last ping index in this tile
    side: str           # "port" or "starboard"
    altitude_m: float   # Towfish altitude for this section


def tile_waterfall(
    waterfall_bytes: bytes,
    tile_width: int = 512,
    tile_height: int = 512,
    overlap: int = 128,
) -> list[Tile]:
    """Split a corrected waterfall image into overlapping tiles.

    Args:
        waterfall_bytes: The full corrected waterfall as image bytes.
        tile_width:      Width of each tile in pixels.
        tile_height:     Height of each tile in pixels.
        overlap:         Pixel overlap between adjacent tiles.

    Returns:
        List of Tile objects.

    TODO: Replace stub — currently returns an empty list.
    """
    return []
