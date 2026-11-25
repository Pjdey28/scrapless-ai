import { expect, test } from "@playwright/test";

test("loads a sample order, validates both algorithms, and exposes history", async ({ page }) => {
  await page.goto("/dashboard/optimize");
  await page.getByRole("button", { name: /Load sample order/ }).click();
  await expect(page.getByText("Sample cabinet panel batch")).toBeVisible();
  await page.getByRole("button", { name: /Run optimization/ }).click();
  await expect(page.getByText("Validation passed for both layouts.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Cutting layout for stock sheet 1" })).toBeVisible();
  await expect(page.getByText("Baseline vs. optimized")).toBeVisible();
  await page.getByRole("link", { name: /Placements CSV/ }).click();
  await page.goto("/dashboard/history");
  await expect(
    page.getByRole("row").filter({ hasText: "First Fit Decreasing" }),
  ).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: "MaxRects BSSF" })).toHaveCount(1);
});
