"use client";

import type { AlgorithmResult } from "@/types/api";

const colors = ["#dce8c5", "#e4e6d9", "#e8d9ba", "#d6e2df", "#e3d8d1", "#dfe5c9"];

export function LayoutPreview({ result }: { result: AlgorithmResult }) {
  const { sheet_config: sheet, placements } = result;
  const usedSheets = Array.from(new Set(placements.map((part) => part.sheet_index)));
  if (usedSheets.length === 0) {
    return <div className="empty compact">No parts were placed on {sheet.material} stock. Review the sheet dimensions and maximum sheet limit.</div>;
  }
  return (
    <div className="layout-sheets">
      {usedSheets.map((sheetIndex) => {
        const sheetParts = placements.filter((part) => part.sheet_index === sheetIndex);
        return (
          <div className="layout-sheet" key={sheetIndex}>
            <div className="layout-sheet-label">
              <span>Stock sheet {sheetIndex + 1} · {sheet.material}</span>
              <span>{sheet.width} × {sheet.length}</span>
            </div>
            <svg
              aria-label={`Cutting layout for ${sheet.material} stock sheet ${sheetIndex + 1}`}
              className="layout-svg"
              role="img"
              viewBox={`0 0 ${sheet.width} ${sheet.length}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <title>{`Validated ${sheet.material} cutting plan, ${sheet.width} by ${sheet.length} stock units`}</title>
              <defs>
                <pattern id={`sheet-grid-${sheetIndex}`} width="25" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e4e5dc" strokeWidth="0.7" />
                </pattern>
              </defs>
              <rect x="0" y="0" width={sheet.width} height={sheet.length} fill={`url(#sheet-grid-${sheetIndex})`} stroke="#68745a" strokeWidth="2" />
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
                      stroke="#64745a"
                      strokeWidth="1.5"
                    />
                    <text
                      x={part.x + part.placed_length / 2}
                      y={y + part.placed_width / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.max(14, Math.min(48, Math.min(part.placed_length, part.placed_width) / 4))}
                      fontWeight="650"
                      fill="#303a2b"
                    >
                      {part.part_id}
                    </text>
                    {part.rotated && (
                      <text
                        x={part.x + part.placed_length - Math.min(part.placed_length, part.placed_width) * 0.1}
                        y={y + Math.min(part.placed_length, part.placed_width) * 0.13}
                        textAnchor="end"
                        fontSize={Math.max(10, Math.min(20, Math.min(part.placed_length, part.placed_width) / 7))}
                        fontWeight="700"
                        fill="#526626"
                      >
                        ↻
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="layout-legend">Parts shown at physical dimensions. Coordinates use the lower-left sheet origin. ↻ indicates a 90° rotation.</div>
          </div>
        );
      })}
    </div>
  );
}
