import { render, screen } from "@testing-library/react";
import { Boxes } from "lucide-react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "@/components/ui/kpi-card";

describe("KpiCard", () => {
  it("renders the supplied value and caption", () => {
    render(<KpiCard label="Sheets used" value="8" caption="Across saved runs" icon={Boxes} />);
    expect(screen.getByText("Sheets used")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Across saved runs")).toBeInTheDocument();
  });
});
