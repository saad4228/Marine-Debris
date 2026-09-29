# NADIR Sonar Processing & Detection Backend

Backend API for NADIR — Side-Scan Sonar (SSS) Marine Debris & Seabed Hazard Detection System (SIH 2026).

---

## Tech Stack
* **Framework**: FastAPI (Python 3.11+)
* **Database**: PostgreSQL (via `asyncpg` + SQLAlchemy 2.0 async)
* **ML Interface**: Pluggable `BaseDetector` with deterministic stub fallback

---

## Quick Start

### 1. Setup Python Environment
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment (`.env`)
Ensure PostgreSQL is running locally or provide your database connection string:
```bash
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/nadir
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
USE_STUB_MODEL=true
```

*(If PostgreSQL is not yet created, run `createdb nadir` or create it in pgAdmin/Docker)*.

### 3. Run Development Server
```bash
uvicorn app.main:app --reload --port 8000
```
* **API Documentation (Swagger UI)**: [http://localhost:8000/docs](http://localhost:8000/docs)
* **Alternative Docs (ReDoc)**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## Trained ML Model (Integrated)

The backend uses a trained **Ultralytics YOLO** model for marine debris detection, shipped as
`new.zip`. The weights are ~130 MB — well over GitHub's 100 MB per-file limit — so `new.zip`
is distributed out of band and is gitignored. Drop it in `backend/` and the detector unpacks
it to `new.pt` automatically on first inference; that extracted file is cached and reused.

### 14 Detection Classes
`bottle`, `can`, `chain`, `drink_carton`, `hook`, `propeller`, `tire`/`tyre`, `valve`, `plane`, `ship`, `human`, `ghost_net`/`ghost-net`, `crab_pot`, `fishing_gear`

### Configuration
In `.env`:
```bash
MODEL_PATH=new.pt        # weights file; auto-extracted from new.zip if absent
USE_STUB_MODEL=false     # set true to use fake detections for dev
```

### Architecture
- `app/pipeline/acoustic/denoise.py` — denoising & radiometric conditioning (see above)
- `app/pipeline/interface.py` — `BaseDetector` ABC and `DetectionResult` dataclass (with sonar telemetry fields)
- `app/pipeline/yolo_detector.py` — `YoloDetector` (real inference + geo/acoustic derivation)
- `app/pipeline/stub_detector.py` — `StubDetector` (deterministic fakes for offline dev)
- `app/api/deps.py` — `get_detector()` switches based on `USE_STUB_MODEL`

Each detection includes: class, confidence, normalised bbox, **plus** side (port/starboard), ground range, depth, lat/lon, echo/shadow lengths, estimated height, survey line, and ping number.

---

## Acoustic Denoising

Every XTF channel is denoised before the waterfall is sliced into tiles, so the detector
sees a flat, evenly-lit seabed instead of sensor artefacts.

Pipeline order (`app/pipeline/acoustic/`):

| # | Stage | Module |
|---|---|---|
| 1 | Parse XTF pings, navigation & telemetry | `xtf_processor.py` |
| 2 | **Denoise pass A** — bad-ping repair, spike clipping | `denoise.py` |
| 3 | Water-column removal (first bottom return) | `water_column.py` |
| 4 | Slant-to-ground geometric correction | `slant_range.py` |
| 5 | **Denoise pass B** — beam pattern, destripe, despeckle | `denoise.py` |
| 6 | Port/starboard compositing & contrast stretch | `gain_correction.py` |
| 7 | Overlapping 640×640 JPG tiles + geo metadata | `tiling.py` |
| 8 | YOLO inference | `yolo_detector.py` |

Pass A runs on raw backscatter because a dead or saturated ping would otherwise drag the
nadir search off the true seabed. Pass B runs per channel *after* geometry, so each
transducer's gain profile is measured against real ground range and the despeckle window
never straddles the port/starboard seam.

Bad pings are **repaired by interpolation, never dropped** — every waterfall row is indexed
against an `XtfNavigationPoint` to georeference detections, so removing rows would desync
the two channels and shift every detection's lat/lon.

### Configuration (`.env`)
```bash
DENOISE_ENABLED=true
DESPECKLE_METHOD=lee        # lee | median | bilateral | nlm | wavelet | none
DESPECKLE_FILTER_SIZE=5
DENOISE_BEAM_PATTERN=true   # across-track beam pattern / TVG residual
DENOISE_DESTRIPE=true       # along-track ping-to-ping gain jitter
DENOISE_REPAIR_BAD_PINGS=true
```

`lee` is the default: edge-preserving (targets and their acoustic shadows survive) and
dependency-free. `median` needs SciPy, `bilateral` needs `opencv-python`, and `nlm` /
`wavelet` need `scikit-image` — any missing backend logs a warning and falls back to `lee`
rather than failing the upload. SciPy itself is optional; without it the module uses
pure-NumPy box and gaussian filters.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/detect` | Upload sonar tile image (`multipart/form-data`) & get bounding boxes |
| `GET` | `/api/v1/detections` | Query catalogue with filters (`cls`, `status`, `line`) |
| `GET` | `/api/v1/detections/{id}` | Get single target details & acoustic telemetry |
| `PATCH`| `/api/v1/detections/{id}/review`| Analyst review update (`Confirmed by review`, `Candidate`, `Rejected`) |
| `GET` | `/api/v1/surveys` | List registered survey line tracks |
| `POST` | `/api/v1/surveys` | Register survey line metadata |
| `GET` | `/api/v1/exports/geojson` | Nautical chart layer GeoJSON export |
| `GET` | `/api/v1/exports/csv` | Inspection review sheet CSV export |
| `GET` | `/api/v1/stats` | Summary metrics (class breakdown, review progress) |

---

## Running Tests
```bash
pytest tests/ -v
```
