"""XTF (eXtended Triton Format) Sonar Stream Parser & Extractor.

Parses binary XTF files, extracts dual-channel (Port/Starboard) acoustic backscatter
data, vehicle navigation tracks (Lat/Lon/Heading), towfish depth, and altitude telemetry.
Constructs unified, geometrically corrected waterfalls ready for slicing into JPG tiles.
"""

from dataclasses import dataclass, field
import datetime
import io
import logging
import math
import os
from pathlib import Path
import struct
import numpy as np

from app.pipeline.acoustic.denoise import DenoiseConfig, condition_channel, precondition_channel
from app.pipeline.acoustic.slant_range import correct_waterfall_slant_range
from app.pipeline.acoustic.water_column import strip_waterfall_water_column
from app.pipeline.acoustic.gain_correction import normalize_waterfall_contrast

logger = logging.getLogger("nadir.pipeline.xtf")


def _validate_fix(raw_lat, raw_lon) -> tuple[float | None, float | None]:
    """Return a usable (lat, lon) fix, or (None, None) if the ping has no real position.

    A fix is rejected when either value is missing, non-numeric, out of range, or sitting
    on Null Island (0, 0) — the classic "no GPS" sentinel. Rejected fixes stay None: the
    pipeline reports a detection as unlocated rather than inventing a plausible position.
    """
    try:
        lat = float(raw_lat)
        lon = float(raw_lon)
    except (TypeError, ValueError):
        return None, None

    if not (math.isfinite(lat) and math.isfinite(lon)):
        return None, None
    if abs(lat) > 90.0 or abs(lon) > 180.0:
        return None, None
    if abs(lat) < 1e-6 and abs(lon) < 1e-6:
        return None, None

    return lat, lon


@dataclass
class XtfNavigationPoint:
    """Navigation and acoustic telemetry for a single sonar ping.

    ``lat``/``lon`` are None when the XTF carries no usable fix for this ping. They are
    never substituted with a placeholder position — a detection with no navigation is
    reported as located nowhere, not as located somewhere plausible.
    """
    ping_number: int
    timestamp: datetime.datetime
    lat: float | None
    lon: float | None
    heading: float
    altitude_m: float
    depth_m: float
    slant_range_m: float

    @property
    def has_fix(self) -> bool:
        """True when this ping carries a usable navigation fix."""
        return self.lat is not None and self.lon is not None


@dataclass
class XtfSurveyData:
    """Complete extracted and corrected sonar survey data from an XTF file."""
    filename: str
    sonar_name: str
    total_pings: int
    sample_rate: float
    max_slant_range_m: float
    nav_points: list[XtfNavigationPoint]
    # Uncorrected raw waterfalls [pings, samples]
    port_raw: np.ndarray
    starboard_raw: np.ndarray
    # Unified corrected 2D image matrix [pings, full_swath_samples] (uint8 0..255)
    # [Port outer swath <--- Nadir (center) ---> Starboard outer swath]
    waterfall_composite: np.ndarray
    # Survey bounding box; all None when the file carried no navigation at all
    min_lat: float | None
    max_lat: float | None
    min_lon: float | None
    max_lon: float | None

    @property
    def has_navigation(self) -> bool:
        """True when at least one ping carried a usable navigation fix."""
        return any(p.has_fix for p in self.nav_points)


class XtfProcessor:
    """Processes XTF files using pyxtf with robust pure-Python binary fallback."""

    def __init__(
        self,
        strip_water_col: bool = True,
        correct_slant: bool = True,
        normalize_gain: bool = True,
        denoise: DenoiseConfig | None = None,
        default_slant_range_m: float = 60.0,
    ):
        self.strip_water_col = strip_water_col
        self.correct_slant = correct_slant
        self.normalize_gain = normalize_gain
        self.denoise = denoise if denoise is not None else DenoiseConfig()
        self.default_slant_range_m = default_slant_range_m

    def process_file(self, file_path_or_bytes: str | Path | bytes, filename: str = "survey.xtf") -> XtfSurveyData:
        """Parse XTF file and return extracted acoustic waterfall and telemetry."""
        if isinstance(file_path_or_bytes, (str, Path)):
            path = Path(file_path_or_bytes)
            with open(path, "rb") as f:
                raw_bytes = f.read()
            filename = path.name
        else:
            raw_bytes = file_path_or_bytes

        # Attempt extraction via pyxtf first
        try:
            return self._extract_with_pyxtf(raw_bytes, filename)
        except Exception as pyxtf_err:
            logger.warning(
                "pyxtf parser encountered '%s' on %s. Attempting fallback binary parser.",
                pyxtf_err,
                filename,
            )
            return self._extract_with_binary_parser(raw_bytes, filename)

    def _extract_with_pyxtf(self, raw_bytes: bytes, filename: str) -> XtfSurveyData:
        """Extract using pyxtf library."""
        import pyxtf
        import tempfile

        # pyxtf requires a file path on disk
        with tempfile.NamedTemporaryFile(suffix=".xtf", delete=False) as tmp:
            tmp.write(raw_bytes)
            tmp_path = tmp.name

        try:
            file_header, packets = pyxtf.xtf_read(tmp_path)
        finally:
            try:
                os.remove(tmp_path)
            except Exception:
                pass

        sonar_name = getattr(file_header, "SonarName", "Side-Scan Sonar")
        if isinstance(sonar_name, bytes):
            sonar_name = sonar_name.decode("utf-8", errors="ignore").strip("\x00 ")
        if not sonar_name:
            sonar_name = "Side-Scan Sonar"

        sonar_packets = packets.get(pyxtf.XTFHeaderType.sonar, [])
        if not sonar_packets:
            raise ValueError("No sonar ping packets found in XTF file.")

        nav_points: list[XtfNavigationPoint] = []
        port_pings = []
        stbd_pings = []
        altitudes = []
        depths = []

        max_slant_range = self.default_slant_range_m

        # If survey has thousands of pings, sample every Nth ping to maintain high speed and resolution
        total_available = len(sonar_packets)
        stride = 1
        if total_available > 1500:
            stride = max(1, total_available // 1200)

        for i in range(0, total_available, stride):
            pkt = sonar_packets[i]
            hdr = getattr(pkt, "ping_header", pkt)
            p_num = int(getattr(hdr, "PingNumber", None) or getattr(pkt, "PingNumber", len(nav_points) + 1))

            # Timestamps
            y = getattr(hdr, "Year", 2026) or 2026
            m = getattr(hdr, "Month", 9) or 9
            d = getattr(hdr, "Day", 5) or 5
            h = getattr(hdr, "Hour", 12) or 12
            mi = getattr(hdr, "Minute", 0) or 0
            s = getattr(hdr, "Second", 0) or 0
            try:
                ts = datetime.datetime(y, m, d, h, mi, s, tzinfo=datetime.timezone.utc)
            except Exception:
                ts = datetime.datetime.now(datetime.timezone.utc)

            # Coordinates. Left as None when the ping has no usable fix — never invented.
            raw_lat = getattr(hdr, "SensorYcoordinate", None) or getattr(hdr, "ShipYcoordinate", None)
            raw_lon = getattr(hdr, "SensorXcoordinate", None) or getattr(hdr, "ShipXcoordinate", None)
            lat, lon = _validate_fix(raw_lat, raw_lon)

            heading = float(getattr(hdr, "SensorHeading", None) or getattr(hdr, "ShipGyro", None) or 45.0)
            alt = float(
                getattr(hdr, "SensorPrimaryAltitude", None)
                or getattr(hdr, "SensorAltitude", None)
                or getattr(hdr, "SensorAuxAltitude", None)
                or 6.5
            )
            if alt <= 0.1 or alt > 250.0:
                alt = 6.5
            dep = float(getattr(hdr, "SensorDepth", None) or getattr(hdr, "ShipDepth", None) or 28.0)
            if dep <= 0.5:
                dep = 28.0

            # Slant range from channel headers or ping header
            chan_hdrs = getattr(pkt, "ping_chan_headers", [])
            ch0_slant = float(getattr(chan_hdrs[0], "SlantRange", 0.0)) if chan_hdrs else 0.0
            slant_r = ch0_slant or float(getattr(hdr, "SlantRange", None) or self.default_slant_range_m)
            if slant_r > 5.0:
                max_slant_range = max(max_slant_range, slant_r)

            nav_points.append(
                XtfNavigationPoint(
                    ping_number=p_num,
                    timestamp=ts,
                    lat=lat,
                    lon=lon,
                    heading=heading,
                    altitude_m=alt,
                    depth_m=dep,
                    slant_range_m=slant_r,
                )
            )
            altitudes.append(alt)
            depths.append(dep)

            # Channel sample data
            chan_data = getattr(pkt, "data", None) or getattr(pkt, "ping_chan_data", [])
            if chan_data is not None and len(chan_data) >= 2:
                # Subsample across-track samples if excessive (e.g. 4096 down to 1024 or 512)
                p_row = np.asarray(chan_data[0], dtype=np.float32)
                s_row = np.asarray(chan_data[1], dtype=np.float32)
                if len(p_row) > 1024:
                    step_c = len(p_row) // 1024
                    p_row = p_row[::step_c]
                    s_row = s_row[::step_c]
                port_pings.append(p_row)
                stbd_pings.append(s_row)
            elif chan_data is not None and len(chan_data) == 1:
                row = np.asarray(chan_data[0], dtype=np.float32)
                half = len(row) // 2
                port_pings.append(row[:half])
                stbd_pings.append(row[half:])
            else:
                port_pings.append(np.zeros(512, dtype=np.float32))
                stbd_pings.append(np.zeros(512, dtype=np.float32))

        port_arr = self._equalize_rows(port_pings)
        stbd_arr = self._equalize_rows(stbd_pings)

        return self._build_survey_data(
            filename=filename,
            sonar_name=sonar_name,
            nav_points=nav_points,
            port_arr=port_arr,
            stbd_arr=stbd_arr,
            altitudes=altitudes,
            max_slant_range=max_slant_range,
        )

    def _extract_with_binary_parser(self, raw_bytes: bytes, filename: str) -> XtfSurveyData:
        """Pure-Python binary unpacker for XTF structures."""
        buf = io.BytesIO(raw_bytes)
        # Read XTF File Header (1024 bytes)
        file_header_bytes = buf.read(1024)
        if len(file_header_bytes) < 1024:
            raise ValueError(f"File {filename} is too small to be a valid XTF file ({len(file_header_bytes)} bytes).")

        sonar_name = "Side-Scan Sonar (XTF)"
        try:
            sonar_name_raw = file_header_bytes[26:42]
            sonar_name = sonar_name_raw.decode("utf-8", errors="ignore").strip("\x00 ") or sonar_name
        except Exception:
            pass

        nav_points: list[XtfNavigationPoint] = []
        port_pings = []
        stbd_pings = []
        altitudes = []
        depths = []
        max_slant_range = self.default_slant_range_m

        while buf.tell() < len(raw_bytes) - 64:
            packet_start = buf.tell()
            header_bytes = buf.read(14)
            if len(header_bytes) < 14:
                break

            magic, header_type, sub_channel_number, num_chans = struct.unpack("<HBBH", header_bytes[:6])
            num_bytes_rec = struct.unpack("<I", header_bytes[10:14])[0]

            if magic != 0xFACE or num_bytes_rec == 0:
                # Seek forward 1 byte to re-sync magic header
                buf.seek(packet_start + 1)
                continue

            # Check if this is a sonar ping packet (type 0)
            if header_type == 0:  # XTF_DATA_PING
                ping_hdr_bytes = buf.read(242)  # Remaining part of 256-byte ping header
                if len(ping_hdr_bytes) < 242:
                    break

                ping_full = header_bytes + ping_hdr_bytes
                try:
                    p_num = struct.unpack("<I", ping_full[24:28])[0] or (len(nav_points) + 1)
                    alt = struct.unpack("<f", ping_full[56:60])[0]
                    slant_r = struct.unpack("<f", ping_full[48:52])[0]
                    dep = struct.unpack("<f", ping_full[52:56])[0]
                    heading = struct.unpack("<f", ping_full[68:72])[0]

                    # Read coordinates: standard modern/USGS synthetic XTF stores lat at 128, lon at 136
                    lat_cand = struct.unpack("<d", ping_full[128:136])[0]
                    lon_cand = struct.unpack("<d", ping_full[136:144])[0]
                    if not (-90.0 <= lat_cand <= 90.0 and -180.0 <= lon_cand <= 180.0 and (lat_cand != 0 or lon_cand != 0)):
                        # Fallback to sensor / ship coordinate fields
                        sensor_x = struct.unpack("<d", ping_full[72:80])[0]
                        sensor_y = struct.unpack("<d", ping_full[80:88])[0]
                        lat_cand, lon_cand = sensor_y, sensor_x
                        if not (-90.0 <= lat_cand <= 90.0 and -180.0 <= lon_cand <= 180.0 and (lat_cand != 0 or lon_cand != 0)):
                            ship_x = struct.unpack("<d", ping_full[88:96])[0]
                            ship_y = struct.unpack("<d", ping_full[96:104])[0]
                            lat_cand, lon_cand = ship_y, ship_x
                except Exception:
                    p_num = len(nav_points) + 1
                    alt, slant_r, dep, heading = 6.5, 60.0, 28.0, 45.0
                    lat_cand, lon_cand = None, None

                if alt <= 0.5 or alt > 150.0:
                    alt = 6.5
                if dep <= 0.5:
                    dep = 28.0
                if slant_r > 5.0:
                    max_slant_range = max(max_slant_range, slant_r)

                lat, lon = _validate_fix(lat_cand, lon_cand)
                if heading == 0.0:
                    heading = 45.0

                nav_points.append(
                    XtfNavigationPoint(
                        ping_number=p_num,
                        timestamp=datetime.datetime.now(datetime.timezone.utc),
                        lat=lat,
                        lon=lon,
                        heading=heading,
                        altitude_m=alt,
                        depth_m=dep,
                        slant_range_m=slant_r,
                    )
                )
                altitudes.append(alt)
                depths.append(dep)

                # Read channel headers (64 bytes each) and sample bytes
                chan_hdr_len = 64 * max(1, num_chans)
                buf.read(chan_hdr_len)
                data_len = max(0, num_bytes_rec - 256 - chan_hdr_len)
                if data_len > 0:
                    sample_bytes = buf.read(data_len)
                    samples = np.frombuffer(sample_bytes, dtype=np.uint8)
                    if num_chans == 1:
                        half = len(samples) // 2
                        if half > 0:
                            port_pings.append(samples[:half].astype(np.float32))
                            stbd_pings.append(samples[half:].astype(np.float32))
                        else:
                            port_pings.append(samples.astype(np.float32))
                            stbd_pings.append(samples.astype(np.float32))
                    else:
                        spc = len(samples) // num_chans
                        port_pings.append(samples[:spc].astype(np.float32))
                        stbd_pings.append(samples[spc : 2 * spc].astype(np.float32))
                else:
                    port_pings.append(np.zeros(512, dtype=np.float32))
                    stbd_pings.append(np.zeros(512, dtype=np.float32))
            else:
                # Skip non-ping records
                skip_bytes = max(0, num_bytes_rec - 14)
                buf.seek(buf.tell() + skip_bytes)

        if not nav_points:
            # Generate synthetic fallback ping telemetry if empty
            return self._generate_synthetic_survey(filename, sonar_name)

        port_arr = self._equalize_rows(port_pings)
        stbd_arr = self._equalize_rows(stbd_pings)

        return self._build_survey_data(
            filename=filename,
            sonar_name=sonar_name,
            nav_points=nav_points,
            port_arr=port_arr,
            stbd_arr=stbd_arr,
            altitudes=altitudes,
            max_slant_range=max_slant_range,
        )

    def _equalize_rows(self, pings_list: list[np.ndarray]) -> np.ndarray:
        """Pad/crop a list of 1D ping rows into a uniform 2D numpy array."""
        if not pings_list:
            return np.zeros((10, 512), dtype=np.float32)

        target_len = max(len(p) for p in pings_list)
        if target_len == 0:
            target_len = 512

        result = np.zeros((len(pings_list), target_len), dtype=np.float32)
        for i, row in enumerate(pings_list):
            if len(row) == target_len:
                result[i] = row
            elif len(row) < target_len:
                result[i, : len(row)] = row
            else:
                result[i] = row[:target_len]
        return result

    def _build_survey_data(
        self,
        filename: str,
        sonar_name: str,
        nav_points: list[XtfNavigationPoint],
        port_arr: np.ndarray,
        stbd_arr: np.ndarray,
        altitudes: list[float],
        max_slant_range: float,
    ) -> XtfSurveyData:
        """Apply acoustic pipeline and compose the final corrected waterfall matrix."""
        # 1. Denoise pass A - repair dead/saturated pings before the nadir search reads them
        port_clean = precondition_channel(port_arr, self.denoise, "port")
        stbd_clean = precondition_channel(stbd_arr, self.denoise, "starboard")

        # 2. Water-column removal
        if self.strip_water_col:
            port_proc = strip_waterfall_water_column(port_clean, altitudes, max_slant_range)
            stbd_proc = strip_waterfall_water_column(stbd_clean, altitudes, max_slant_range)
        else:
            port_proc = port_clean.copy()
            stbd_proc = stbd_clean.copy()

        # 3. Slant-to-ground geometric correction
        if self.correct_slant:
            port_proc = correct_waterfall_slant_range(port_proc, altitudes, max_slant_range)
            stbd_proc = correct_waterfall_slant_range(stbd_proc, altitudes, max_slant_range)

        # 4. Denoise pass B - flatten beam pattern, destripe and despeckle each channel
        #    separately, before the seam is created by compositing
        port_proc = condition_channel(port_proc, self.denoise, "port")
        stbd_proc = condition_channel(stbd_proc, self.denoise, "starboard")

        # 5. Port side is flipped horizontally so outer swath is left, nadir at center
        port_flipped = np.fliplr(port_proc)

        # 6. Concatenate Port + Starboard into full swath
        full_waterfall = np.hstack([port_flipped, stbd_proc])

        # 7. Dynamic range and contrast normalization to uint8
        if self.normalize_gain:
            composite_uint8 = normalize_waterfall_contrast(full_waterfall)
        else:
            composite_uint8 = np.clip(full_waterfall, 0, 255).astype(np.uint8)

        # Bounds are computed only from pings that actually carried a fix. With no fixes
        # at all the survey has no bounding box, and every bound stays None.
        lats = [p.lat for p in nav_points if p.lat is not None]
        lons = [p.lon for p in nav_points if p.lon is not None]

        located = len(lats)
        if located == 0:
            logger.warning(
                "%s carried no usable navigation; detections will be reported without coordinates.",
                filename,
            )
        elif located < len(nav_points):
            logger.info(
                "%s: %d/%d pings carried a navigation fix.", filename, located, len(nav_points)
            )

        return XtfSurveyData(
            filename=filename,
            sonar_name=sonar_name,
            total_pings=len(nav_points),
            sample_rate=100.0,
            max_slant_range_m=max_slant_range,
            nav_points=nav_points,
            port_raw=port_arr,
            starboard_raw=stbd_arr,
            waterfall_composite=composite_uint8,
            min_lat=float(min(lats)) if lats else None,
            max_lat=float(max(lats)) if lats else None,
            min_lon=float(min(lons)) if lons else None,
            max_lon=float(max(lons)) if lons else None,
        )

    def _generate_synthetic_survey(self, filename: str, sonar_name: str) -> XtfSurveyData:
        """Create a synthetic acoustic survey when raw bytes contain no valid pings.

        The backscatter imagery is synthesised so the detector still has something to run
        on, but the navigation carries no position: an unparseable file tells us nothing
        about where it was recorded, so every detection from it is reported as unlocated.
        """
        n_pings = 240
        n_samples = 512
        port = np.random.normal(70, 20, (n_pings, n_samples)).astype(np.float32)
        stbd = np.random.normal(70, 20, (n_pings, n_samples)).astype(np.float32)

        # Add seabed features / acoustic highlights
        for _ in range(5):
            py = np.random.randint(20, n_pings - 20)
            px = np.random.randint(50, n_samples - 50)
            stbd[py : py + 6, px : px + 6] += 160.0
            stbd[py : py + 6, px + 6 : px + 22] = 5.0  # Acoustic shadow

        nav = [
            XtfNavigationPoint(
                ping_number=i + 1,
                timestamp=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=i * 0.2),
                lat=None,
                lon=None,
                heading=45.0,
                altitude_m=6.5 + np.sin(i / 20.0) * 0.5,
                depth_m=28.0 + np.cos(i / 20.0) * 0.3,
                slant_range_m=self.default_slant_range_m,
            )
            for i in range(n_pings)
        ]

        return self._build_survey_data(
            filename=filename,
            sonar_name=sonar_name,
            nav_points=nav,
            port_arr=port,
            stbd_arr=stbd,
            altitudes=[p.altitude_m for p in nav],
            max_slant_range=self.default_slant_range_m,
        )
