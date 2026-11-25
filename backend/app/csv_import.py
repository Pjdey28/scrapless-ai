from __future__ import annotations

import csv
import io
from typing import Any

from pydantic import ValidationError

from app.schemas import Part

MAX_UPLOAD_BYTES = 1 * 1024 * 1024
MAX_ROWS = 250
REQUIRED_COLUMNS = {"part_id", "length", "width", "quantity"}


def parse_parts_csv(contents: bytes) -> tuple[list[Part], list[dict[str, Any]]]:
    if len(contents) > MAX_UPLOAD_BYTES:
        raise ValueError(f"CSV exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit.")
    try:
        text = contents.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("CSV must be UTF-8 encoded.") from exc
    reader = csv.DictReader(io.StringIO(text))
    columns = set(reader.fieldnames or [])
    missing = sorted(REQUIRED_COLUMNS - columns)
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(missing)}.")
    parts: list[Part] = []
    errors: list[dict[str, Any]] = []
    for row_number, row in enumerate(reader, start=2):
        if row_number > MAX_ROWS + 1:
            raise ValueError(f"CSV exceeds the {MAX_ROWS:,}-row limit.")
        try:
            parts.append(
                Part.model_validate(
                    {
                        key: value
                        for key, value in row.items()
                        if key in Part.model_fields and value not in (None, "")
                    }
                )
            )
        except ValidationError as exc:
            errors.append({"row": row_number, "errors": exc.errors(include_url=False)})
    if not parts and not errors:
        raise ValueError("CSV contains no part rows.")
    return parts, errors
