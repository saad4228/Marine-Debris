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

The backend ships with a trained **Ultralytics YOLO** model (`best.pt` / `best.zip`) for marine debris detection.

### 14 Detection Classes
`bottle`, `can`, `chain`, `drink_carton`, `hook`, `propeller`, `tire`/`tyre`, `valve`, `plane`, `ship`, `human`, `ghost_net`/`ghost-net`, `crab_pot`, `fishing_gear`

### Configuration
In `.env`:
```bash
MODEL_PATH=best.pt       # path to weights file
USE_STUB_MODEL=false     # set true to use fake detections for dev
```

### Architecture
- `app/pipeline/interface.py` — `BaseDetector` ABC and `DetectionResult` dataclass (with sonar telemetry fields)
- `app/pipeline/yolo_detector.py` — `YoloDetector` (real inference + geo/acoustic derivation)
- `app/pipeline/stub_detector.py` — `StubDetector` (deterministic fakes for offline dev)
- `app/api/deps.py` — `get_detector()` switches based on `USE_STUB_MODEL`

Each detection includes: class, confidence, normalised bbox, **plus** side (port/starboard), ground range, depth, lat/lon, echo/shadow lengths, estimated height, survey line, and ping number.

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
