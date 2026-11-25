# API reference

FastAPI generates the complete OpenAPI schema and interactive docs at `/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health and demo-mode status |
| GET | `/api/v1/demo/sample-order` | Built-in sample production order |
| POST | `/api/v1/orders/validate` | Validate CSV, returning accepted rows and row-specific errors |
| POST | `/api/v1/optimize` | Run FFD and MaxRects, validate layouts, calculate metrics, and return synthetic risk signal |
| GET | `/api/v1/optimize/{run_id}` | Retrieve a run from in-process demo memory |
| GET | `/api/v1/optimize/{run_id}/metrics` | Retrieve run metrics |
| GET | `/api/v1/optimize/{run_id}/placements` | Retrieve placements |
| GET | `/api/v1/history` | List in-process demo results |
| GET | `/api/v1/analytics/overview` | Aggregate in-process demo metrics |
| GET | `/api/v1/analytics/trends` | Actual current-process results; empty before a run |
| POST | `/api/v1/ml/predict-risk` | Synthetic-trained scrap-risk estimate |
| GET | `/api/v1/ml/evaluation` | Fixed-seed synthetic train/test evaluation |
| POST | `/api/v1/vision/detect` | OpenCV contour detection for a real uploaded image |
| GET | `/api/v1/reports/{run_id}/json` | Complete JSON report |
| GET | `/api/v1/reports/{run_id}/placements.csv` | Placement CSV |

JSON optimization requests contain `order` and `sheet_config`. Both packing algorithms share this input. CSV upload requires `part_id,length,width,quantity`; `priority,material,description` are optional. CSV requests are limited to 2 MiB and 10,000 rows. Vision uploads are limited to 8 MiB and 20 megapixels.

Run locally:

```powershell
Set-Location backend
python -m uvicorn app.main:app --reload --port 8000
```
