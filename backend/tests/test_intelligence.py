import io

from app.ml.risk import model_evaluation, predict_risk
from app.schemas import Order, Part, SheetConfig
from app.vision.detector import detect_rectangles
from PIL import Image, ImageDraw


def _inputs() -> tuple[Order, SheetConfig]:
    order = Order(
        order_id="ml-test",
        name="ML test",
        parts=[Part(part_id="A", length=200, width=100, quantity=6)],
    )
    sheet = SheetConfig(length=1000, width=500, material="steel")
    return order, sheet


def test_synthetic_model_reports_evaluation_and_disclaimer() -> None:
    evaluation = model_evaluation()
    assert 0 <= evaluation["accuracy"] <= 1
    assert evaluation["training_rows"] > 0
    assert len(evaluation["feature_importance"]) == 9
    assert "synthetic" in evaluation["data_disclaimer"].lower()
    prediction = predict_risk(*_inputs())
    assert prediction["risk_class"] in {"high", "lower"}
    assert 0 <= prediction["model_score"] <= 1
    assert "industry-validated" in prediction["data_disclaimer"]


def test_vision_rejects_non_image_payload() -> None:
    try:
        detect_rectangles(b"not an image")
    except ValueError as exc:
        assert "readable image" in str(exc)
    else:
        raise AssertionError("Invalid image was accepted.")


def test_vision_returns_pixel_regions_and_annotated_image() -> None:
    image = Image.new("RGB", (240, 160), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 90, 90), fill="black")
    draw.rectangle((130, 35, 205, 120), fill="black")
    data = io.BytesIO()
    image.save(data, format="PNG")

    result = detect_rectangles(data.getvalue(), threshold=180, minimum_area=200)
    assert result["candidate_count"] == 2
    assert result["units"] == "pixels"
    assert result["regions"][0]["width"] > 0
    assert result["annotated_image_base64"]
    assert "calibration" in result["limitation"]
