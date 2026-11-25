import { expect, test } from "@playwright/test";

test("loads a sample order, validates both algorithms, and exposes history", async ({ page }) => {
  await page.goto("/dashboard/optimize");
  await page.getByRole("button", { name: /Load sample order/ }).click();
  await expect(page.getByText("Sample cabinet panel batch")).toBeVisible();
  await page.getByRole("button", { name: /Run optimization/ }).click();
  await expect(page.getByText("Validation passed for both layouts.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Cutting layout for MDF stock sheet 1" })).toBeVisible();
  await expect(page.getByText("Baseline vs. optimized")).toBeVisible();
  const reportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Placements CSV/ }).click();
  expect((await reportDownload).suggestedFilename()).toContain("placements.csv");
  await page.goto("/dashboard/history");
  await expect(
    page.getByRole("row").filter({ hasText: "First Fit Decreasing" }),
  ).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: "MaxRects BSSF" })).toHaveCount(1);
});

test("order form exposes field errors and enforces the backend instance limit", async ({ page }) => {
  await page.goto("/dashboard/orders");
  await page.getByRole("button", { name: "Save order" }).click();
  await expect(page.getByLabel("Part ID")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert").filter({ hasText: "Part ID is required." })).toBeVisible();

  await page.getByLabel("Order ID").fill("E2E-CAP");
  await page.getByLabel("Order name").fill("Instance cap validation");
  await page.getByLabel("Part ID").fill("PANEL");
  await page.getByLabel("Quantity").fill("501");
  await page.getByRole("button", { name: "Save order" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Quantity cannot exceed 500." })).toBeVisible();
});

test("invalid vision selections can be reselected after validation fails", async ({ page }) => {
  await page.goto("/dashboard/vision");
  const imageInput = page.getByLabel("Material image");
  const invalidFile = {
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  };
  await imageInput.setInputFiles(invalidFile);
  await expect(page.getByRole("alert").filter({ hasText: "Choose an image file." })).toBeVisible();
  await expect(imageInput).toHaveValue("");
  await imageInput.setInputFiles(invalidFile);
  await expect(page.getByRole("alert").filter({ hasText: "Choose an image file." })).toBeVisible();
});

test("dashboard, analytics, and insights expose recoverable API errors", async ({ page }) => {
  await page.route("**/api/v1/analytics/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Analytics service unavailable for this test." }),
    }),
  );
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Overview is unavailable" })).toBeVisible();
  await page.getByRole("button", { name: "Retry loading overview" }).click();
  await expect(page.getByRole("heading", { name: "Overview is unavailable" })).toBeVisible();

  await page.goto("/dashboard/analytics");
  await expect(page.getByRole("alert").filter({ hasText: "Analytics service unavailable for this test." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  await page.route("**/api/v1/ml/evaluation**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Model evaluation service unavailable for this test." }),
    }),
  );
  await page.route("**/api/v1/ml/predict-risk**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Risk assessment service unavailable for this test." }),
    }),
  );
  await page.goto("/dashboard/ai-insights");
  await expect(page.getByRole("heading", { name: "Assessment unavailable" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Risk assessment service unavailable for this test." })).toBeVisible();
  await expect(page.getByText("Evaluating this order…")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry assessment" })).toBeVisible();
});
