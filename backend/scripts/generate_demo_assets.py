from __future__ import annotations

import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "backend" / "data"
PUBLIC_DIR = ROOT / "frontend" / "public" / "demo"
DATASET_ID = "apex-industrial-components-v1"
REFERENCE_DATE = date(2026, 11, 26)
MATERIALS = (
    ("Mild steel", 2500, 1250, 185.0, "USD"),
    ("Aluminium", 2440, 1220, 142.5, "USD"),
    ("Stainless steel", 2000, 1000, 228.0, "EUR"),
)
CUSTOMERS = (
    "Northstar Equipment",
    "Meridian Fabrication",
    "Pioneer Process Systems",
    "Summit Material Handling",
    "Harborline Machinery",
    "Cedar Works",
)
ORDER_NAMES = (
    "Press frame reinforcement",
    "Conveyor guard panels",
    "Pump skid mounting plates",
    "Packaging line brackets",
    "Industrial cabinet doors",
    "Mixer housing components",
    "Work-cell safety panels",
    "Palletizer support plates",
    "Filter housing blanks",
    "CNC enclosure panels",
    "Service platform tread plates",
    "Agitator base components",
    "Robotic cell partitions",
    "Heat exchanger end plates",
    "Material chute liners",
    "Compressor mounting set",
    "Warehouse lift brackets",
    "Hydraulic manifold covers",
    "Dust collector panels",
    "Machine base gussets",
    "Pump station cover set",
    "Conveyor transfer plates",
    "Cutting table supports",
    "Production cell panels",
    "Spare parts replenishment",
)
PART_DESCRIPTIONS = (
    "Mounting plate",
    "Side panel",
    "Access cover",
    "Reinforcement blank",
    "Guard section",
    "Base plate",
    "Support bracket",
    "Wear strip",
    "End panel",
    "Service cover",
    "Spacer plate",
    "Frame gusset",
)


def build_dataset() -> dict[str, object]:
    rng = random.Random(46028)
    records: list[dict[str, object]] = []
    for index in range(25):
        material, sheet_length, sheet_width, base_cost, currency = MATERIALS[index % len(MATERIALS)]
        profile = "small-batch" if index < 5 else "high-volume" if index >= 17 else "mixed-production"
        count = rng.randint(5, 12)
        parts: list[dict[str, object]] = []
        for part_index in range(count):
            length = rng.randrange(120, min(780, sheet_length // 2) + 1, 10)
            width = rng.randrange(90, min(480, sheet_width // 2) + 1, 10)
            if profile == "small-batch":
                quantity = rng.randint(1, 2)
            elif profile == "high-volume":
                quantity = rng.randint(5, 8)
            else:
                quantity = rng.randint(2, 5)
            parts.append({
                "part_id": f"APX-{index + 1:02d}-P{part_index + 1:02d}",
                "length": length,
                "width": width,
                "quantity": quantity,
                "priority": max(0, 100 - index * 3 + rng.randint(-10, 10)),
                "material": material,
                "description": PART_DESCRIPTIONS[(index + part_index) % len(PART_DESCRIPTIONS)],
            })

        created_at = REFERENCE_DATE - timedelta(days=25 - index)
        priority = (
            "urgent" if index in {2, 11, 21}
            else "high" if index in {5, 14, 19}
            else "low" if index in {4, 9, 16, 23}
            else "normal"
        )
        due_offset = 2 if priority == "urgent" else 7 if priority == "high" else 14 if priority == "normal" else 28
        allow_rotation = index not in {3, 10, 18, 22}
        sheet_variation = (index // 3) % 3
        if sheet_variation == 1:
            sheet_length = round(sheet_length * 0.88 / 10) * 10
            sheet_width = round(sheet_width * 0.9 / 10) * 10
        elif sheet_variation == 2:
            sheet_length = round(sheet_length * 1.08 / 10) * 10
            sheet_width = round(sheet_width * 1.05 / 10) * 10
        order_id = f"APX-DEMO-V1-{index + 1:03d}"
        record: dict[str, object] = {
            "order": {
                "order_id": order_id,
                "name": ORDER_NAMES[index],
                "parts": parts,
            },
            "sheet_config": {
                "length": sheet_length,
                "width": sheet_width,
                "material": material,
                "cost_per_sheet": round(base_cost * (0.92 + (index % 5) * 0.04), 2),
                "currency": currency,
                "spacing": 3,
                "allow_rotation": allow_rotation,
                "max_sheets": 50,
                "margin": 0,
            },
            "metadata": {
                "dataset_id": DATASET_ID,
                "customer_name": CUSTOMERS[index % len(CUSTOMERS)],
                "created_at": created_at.isoformat(),
                "due_date": (created_at + timedelta(days=due_offset)).isoformat(),
                "priority": priority,
                "status": ("in production" if index % 7 == 0 else "ready" if index % 4 == 0 else "queued"),
                "workload_profile": profile,
                "rotation_sensitive": not allow_rotation,
                "timestamp_is_simulated": True,
            },
        }
        records.append(record)
    return {
        "dataset_id": DATASET_ID,
        "company_name": "Apex Industrial Components",
        "description": "Fictional, deterministic manufacturing orders for product demonstration.",
        "records": records,
    }


def _write_csv(path: Path, record: dict[str, object]) -> None:
    order = record["order"]
    assert isinstance(order, dict)
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=("part_id", "length", "width", "quantity", "priority", "material", "description"),
        )
        writer.writeheader()
        writer.writerows(order["parts"])


def _write_vision_image(path: Path) -> None:
    image = Image.new("RGB", (1200, 800), "#f6f5f0")
    draw = ImageDraw.Draw(image)
    draw.rectangle((50, 50, 1150, 750), fill="#ffffff", outline="#d3d5ca", width=4)
    parts = (
        (100, 105, 330, 260, "BRACKET BLANK"),
        (370, 105, 720, 205, "SIDE PANEL"),
        (760, 105, 1090, 315, "MOUNT PLATE"),
        (100, 305, 255, 555, "GUSSET"),
        (295, 275, 610, 470, "COVER"),
        (650, 355, 890, 625, "END PLATE"),
        (930, 365, 1090, 625, "SUPPORT"),
        (320, 520, 565, 690, "ACCESS PANEL"),
    )
    try:
        font = ImageFont.truetype("arial.ttf", 20)
    except OSError:
        font = ImageFont.load_default()
    for left, top, right, bottom, label in parts:
        draw.rounded_rectangle((left, top, right, bottom), radius=3, fill="#56683b")
        bounds = draw.textbbox((0, 0), label, font=font)
        text_width = bounds[2] - bounds[0]
        text_height = bounds[3] - bounds[1]
        draw.text(
            ((left + right - text_width) / 2, (top + bottom - text_height) / 2),
            label,
            fill="#ffffff",
            font=font,
        )
    image.save(path, format="PNG", optimize=True)


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    dataset = build_dataset()
    dataset_path = DATA_DIR / "demo_orders.json"
    dataset_path.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")
    records = dataset["records"]
    assert isinstance(records, list)
    _write_csv(PUBLIC_DIR / "basic-parts-sample.csv", records[0])
    dense = next(record for record in records if record["metadata"]["workload_profile"] == "high-volume")
    _write_csv(PUBLIC_DIR / "production-order-parts-sample.csv", dense)
    _write_vision_image(DATA_DIR / "demo_cutting_layout.png")
    print(f"Generated {len(records)} orders at {dataset_path}")
    print(f"Assets generated under {DATA_DIR} and {PUBLIC_DIR}")


if __name__ == "__main__":
    main()
