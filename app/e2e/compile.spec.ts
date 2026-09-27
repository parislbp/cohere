import { expect, test } from "@playwright/test";
import { SEED, openProject } from "./helpers";

test.describe("compile and diagnostics", () => {
  test("a document with an undefined command reports an error in the gutter and problems panel", async ({ page }) => {
    await openProject(page, SEED.mtm);
    await page.getByTestId("compile-button").click();
    await expect(page.locator(".compile__status")).toContainText(/compiling/);
    const status = page.getByTestId("compile-status");
    await expect(status).toContainText(/1 error/, { timeout: 10_000 });
    await status.click();
    const panel = page.getByTestId("problems-panel");
    await expect(panel).toBeVisible();
    const err = panel.getByTestId("problem-error").first();
    await expect(err).toContainText("Undefined control sequence");
    await expect(err.locator(".prob__loc")).toHaveText(/\.tex:\d+$/);
    // jump opens the file and places the cursor on the line; gutter shows the lint marker
    await err.click();
    await expect(page.locator(".cm-gutter-lint .cm-lint-marker-error")).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator(".cm-lintRange-error")).toHaveCount(1);
    // the PDF was still produced (nonstopmode) and the banner says so
    await expect(page.locator(".pdfpane__banner")).toContainText(/1 error/);
    await expect(page.locator(".pdf-page").first()).toBeVisible();
  });

  test("a clean document compiles with a success chip and a PDF", async ({ page }) => {
    await openProject(page, SEED.scratch);
    await page.getByTestId("compile-button").click();
    const status = page.getByTestId("compile-status");
    await expect(status).toBeVisible({ timeout: 10_000 });
    await expect(status).not.toContainText(/error/);
    await expect(page.locator(".pdf-page").first()).toBeVisible();
    await expect(page.locator(".pdfbar__pages")).toContainText(/\/ \d+/);
    await page.getByRole("button", { name: "Show outputs" }).click();
    await expect(page.getByTestId("output-card")).toContainText(/page/);
  });

  test("log tab streams latexmk output", async ({ page }) => {
    await openProject(page, SEED.scratch);
    await page.getByTestId("compile-button").click();
    await expect(page.getByTestId("compile-status")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("problems-toggle").click();
    await page.getByRole("radio", { name: "log" }).click();
    await expect(page.locator(".log")).toContainText(/latexmk/);
  });

  test("versions: create, list, delete", async ({ page }) => {
    await openProject(page, SEED.storage);
    await page.getByRole("button", { name: "Show outputs" }).click();
    const rows = page.getByTestId("version-row");
    const initial = await rows.count();
    await page.getByRole("button", { name: "New version" }).first().click();
    const dialog = page.getByTestId("snapshot-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox").nth(1).fill("first cut");
    await dialog.getByTestId("create-version").click();
    await expect(rows).toHaveCount(initial + 1);
    await expect(rows.first()).toContainText(`v${initial + 1}`);
    await rows.first().hover();
    await rows.first().getByRole("button", { name: "Delete version" }).click();
    await expect(page.getByTestId("confirm-dialog")).toContainText(`v${initial + 1}`);
    await page.getByTestId("confirm-yes").click();
    await expect(rows).toHaveCount(initial);
  });
});
