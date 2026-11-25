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
    page.getByRole("row").filter({ hasText: "Sample cabinet panel batch" }).filter({ hasText: "First Fit Decreasing" }),
  ).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: "Sample cabinet panel batch" }).filter({ hasText: "MaxRects BSSF" })).toHaveCount(1);
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

test("loads an idempotent demo workspace and exercises orders, results, analytics, AI, history, and vision", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Load Demo Workspace" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirm and load" }).click();
  await expect(page.getByText("Demo workspace is ready")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/25 orders created/)).toBeVisible();
  await expect(page.getByText(/50 algorithm results generated/)).toBeVisible();

  await page.getByRole("link", { name: "Production orders" }).click();
  await expect(page.getByRole("heading", { name: "Saved orders" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "APX-DEMO-V1-" })).toHaveCount(25);
  await expect(page.getByText("Northstar Equipment").first()).toBeVisible();

  await page.getByRole("link", { name: "Cutting optimizer" }).click();
  await page.getByLabel("Or choose a saved order").selectOption("APX-DEMO-V1-001");
  await page.getByRole("button", { name: /Run optimization/ }).click();
  await expect(page.getByText("Validation passed for both layouts.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Cutting layout for Mild steel stock sheet 1" })).toBeVisible();
  const reportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Placements CSV/ }).click();
  expect((await reportDownload).suggestedFilename()).toContain("placements.csv");

  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { name: "FFD vs. MaxRects" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Material consumption" })).toBeVisible();
  await expect(page.getByText(/Demo order dates are simulated historical dates/i)).toBeVisible();

  await page.getByRole("link", { name: "Scrap-risk insights" }).click();
  await expect(page.getByLabel("Order")).toContainText("Press frame reinforcement");
  await expect(page.getByText(/not calibrated real-world probabilities/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Order and stock checks" })).toBeVisible();

  await page.getByRole("link", { name: "Run history" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Press frame reinforcement" }).first()).toBeVisible();
  await expect(page.getByText("Demo · simulated history date").first()).toBeVisible();

  await page.getByRole("link", { name: "Image detection" }).click();
  await page.getByRole("button", { name: "Use included sample image" }).click();
  await expect(page.getByAltText("Selected material pieces, before processing")).toBeVisible();
  await page.getByRole("button", { name: "Detect rectangular regions" }).click();
  await expect(page.getByText(/8 candidate regions/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByAltText("Image annotated with 8 detected bounding boxes")).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  await page.getByRole("button", { name: "Load Demo Workspace" }).click();
  await page.getByRole("button", { name: "Confirm and load" }).click();
  await expect(page.getByText("Demo workspace already populated")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/0 algorithm results generated in this operation/)).toBeVisible();

  await page.getByRole("button", { name: "Reset demo data" }).first().click();
  const resetDialog = page.getByRole("dialog");
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByRole("button", { name: "Reset demo data" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo data reset complete" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Production orders" }).click();
  await expect(page.getByRole("row").filter({ hasText: "APX-DEMO-V1-" })).toHaveCount(0);
  await page.getByRole("link", { name: "Run history", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "Press frame reinforcement" })).toHaveCount(2);
  await expect(page.getByText("Demo · simulated history date")).toHaveCount(0);
});
