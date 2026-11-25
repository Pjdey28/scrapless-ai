from __future__ import annotations

import base64
import io

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000


def detect_rectangles(
    contents: bytes, threshold: int = 180, minimum_area: int = 400
) -> dict[str, object]:
    if not contents or len(contents) > MAX_IMAGE_BYTES:
        raise ValueError(
            f"Image must be non-empty and no larger than {MAX_IMAGE_BYTES // (1024 * 1024)} MB."
        )
    try:
        with Image.open(io.BytesIO(contents)) as image:
            if image.format not in {"PNG", "JPEG", "WEBP", "BMP"}:
                raise ValueError("Unsupported image format; use PNG, JPEG, WEBP, or BMP.")
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError("Image dimensions exceed the 20-megapixel processing limit.")
            rgb = np.asarray(image.convert("RGB"))
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Uploaded file is not a readable image.") from exc

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, mask = cv2.threshold(blurred, threshold, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    annotated = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    regions: list[dict[str, int | float]] = []
    for contour in contours:
        contour_area = float(cv2.contourArea(contour))
        if contour_area < minimum_area:
            continue
        x, y, width, height = cv2.boundingRect(contour)
        if width < 2 or height < 2:
            continue
        regions.append(
            {
                "x": int(x),
                "y": int(y),
                "width": int(width),
                "height": int(height),
                "contour_area_pixels": contour_area,
            }
        )
        cv2.rectangle(annotated, (x, y), (x + width, y + height), (32, 180, 110), 2)
    regions.sort(key=lambda region: (region["y"], region["x"]))
    success, encoded = cv2.imencode(".png", annotated)
    if not success:
        raise RuntimeError("Could not encode the annotated image.")
    return {
        "candidate_count": len(regions),
        "regions": regions,
        "annotated_image_base64": base64.b64encode(encoded.tobytes()).decode("ascii"),
        "units": "pixels",
        "limitation": "Experimental contour detection only. Lighting, reflections, touching pieces, shadows, and perspective can affect results. Physical dimensions require image calibration.",
    }
