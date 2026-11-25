"use client";

import type { AlgorithmResult } from "@/types/api";

const colors = ["#d9ece2", "#e7e8f6", "#f7e9d5", "#e5edf1", "#f3dfe0", "#dceef0"];

export function LayoutPreview({ result }: { result: AlgorithmResult }) {
  const { sheet_config: sheet, placements } = result;
  const usedSheets = Array.from(new Set(placements.map((part) => part.sheet_index)));
  if (usedSheets.length === 0) {
    return <div className="empty compact">No parts were placed. Review the sheet dimensions and maximum sheet limit.</div>;
  }
  return (
    <div className="layout-sheets">
      {usedSheets.map((sheetIndex) => {
        const sheetParts = placements.filter((part) => part.sheet_index === sheetIndex);
        return (
          <div className="layout-sheet" key={sheetIndex}>
            <div className="layout-sheet-label">
              <span>Stock sheet {sheetIndex + 1}</span>
              <span>{sheet.width} × {sheet.length}</span>
            </div>
            <svg
              aria-label={`Cutting layout for stock sheet ${sheetIndex + 1}`}
              className="layout-svg"
              role="img"
              viewBox={`0 0 ${sheet.width} ${sheet.length}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <rect x="0" y="0" width={sheet.width} height={sheet.length} fill="#f7f9f8" stroke="#71827c" strokeWidth="2" />
              {sheetParts.map((part, index) => {
                const y = sheet.length - part.y - part.placed_width;
                return (
                  <g key={part.instance_id}>
                    <rect
                      x={part.x}
                      y={y}
                      width={part.placed_length}
                      height={part.placed_width}
                      fill={colors[index % colors.length]}
                      stroke="#537464"
                      strokeWidth="1.5"
                    />
                    <text
                      x={part.x + part.placed_length / 2}
                      y={y + part.placed_width / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.max(14, Math.min(42, Math.min(part.placed_length, part.placed_width) / 5))}
                      fill="#23392f"
                    >
                      {part.part_id}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="layout-legend">Parts shown at physical dimensions. Coordinates use the lower-left sheet origin.</div>
          </div>
        );
      })}
    </div>
  );
}
