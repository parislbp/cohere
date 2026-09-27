import { expect, test } from "@playwright/test";
import { SEED, gotoLibrary, row } from "./helpers";

test.describe("library", () => {
  test("lists active projects newest first and hides archived", async ({ page }) => {
    await gotoLibrary(page);
    const rows = page.getByTestId("project-row");
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toContainText(SEED.mtm);
    await expect(page.getByText(SEED.thesis)).toHaveCount(0);
    // modified column shows whole days
    await expect(rows.first().locator(".prow__date")).toHaveText(/^(today|\d+ days? ago)$/);
    // type column carries the template glyph with its name on hover
    const type = rows.first().locator(".prow__type");
    await expect(type).toHaveAttribute("aria-label", "Project");
    await type.hover();
    await expect(page.getByRole("tooltip")).toContainText("Project");
  });

  test("favourites: star toggles and the header cycles the filter", async ({ page }) => {
    await gotoLibrary(page);
    const rows = page.getByTestId("project-row");
    await expect(rows).toHaveCount(6);
    // seed marks two favourites
    await page.getByTestId("fav-filter").click();
    await expect(rows).toHaveCount(2);
    await page.getByTestId("fav-filter").click();
    await expect(rows).toHaveCount(4);
    await page.getByTestId("fav-filter").click();
    await expect(rows).toHaveCount(6);
    // star the last row, then favourites-only shows three
    const r = row(page, SEED.scratch);
    await r.hover();
    await r.getByTestId("fav-toggle").click();
    await expect(r.getByTestId("fav-toggle")).toHaveClass(/is-on/);
    await page.getByTestId("fav-filter").click();
    await expect(rows).toHaveCount(3);
  });

  test("search filters as you type and Escape clears", async ({ page }) => {
    await gotoLibrary(page);
    await page.getByRole("button", { name: /search/i }).click();
    const input = page.getByLabel("Search projects");
    await expect(input).toBeFocused();
    await input.fill("convex");
    await expect(page.getByTestId("project-row")).toHaveCount(1);
    await expect(page.getByTestId("project-row").first()).toContainText(SEED.convex);
    await input.fill("energy");
    await expect(page.getByTestId("project-row")).toHaveCount(1);
    await input.press("Escape");
    await expect(page.getByTestId("project-row")).toHaveCount(6);
  });

  test("archived toggle shows archived projects which cannot be opened", async ({ page }) => {
    await gotoLibrary(page);
    await page.getByRole("radio", { name: /archived/i }).click();
    await expect(page.getByTestId("project-row")).toHaveCount(1);
    const r = row(page, SEED.thesis);
    await expect(r).toHaveClass(/is-archived/);
    await expect(r.getByRole("button", { name: `Open ${SEED.thesis}` })).toBeDisabled();
  });

  test("hover reveals row actions; rename changes the title", async ({ page }) => {
    await gotoLibrary(page);
    const r = row(page, SEED.scratch);
    await r.hover();
    await expect(r.getByRole("button", { name: "Rename · topic" })).toBeVisible();
    await r.getByRole("button", { name: "Rename · topic" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const title = dialog.getByRole("textbox").first();
    await title.fill("Scratch Pad");
    await dialog.getByRole("button", { name: "save" }).click();
    await expect(page.getByTestId("project-row").filter({ hasText: "Scratch Pad" })).toHaveCount(1);
  });

  test("archive then unarchive round-trips", async ({ page }) => {
    await gotoLibrary(page);
    const r = row(page, SEED.grant);
    await r.hover();
    await r.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByTestId("project-row")).toHaveCount(5);
    await page.getByRole("radio", { name: /archived/i }).click();
    const archived = row(page, SEED.grant);
    await archived.hover();
    await archived.getByRole("button", { name: "Unarchive" }).click();
    await page.getByRole("radio", { name: /project/i }).first().click();
    await expect(page.getByTestId("project-row")).toHaveCount(6);
  });

  test("delete asks for confirmation and removes the row", async ({ page }) => {
    await gotoLibrary(page);
    const r = row(page, SEED.convex);
    await r.hover();
    await r.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-yes").click();
    await expect(page.getByTestId("project-row")).toHaveCount(5);
    await expect(page.getByText(SEED.convex)).toHaveCount(0);
  });

  test("creates a project from the brief template and opens the editor", async ({ page }) => {
    await gotoLibrary(page);
    await page.getByRole("button", { name: /^new$/i }).click();
    const dialog = page.getByTestId("new-project-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("template-brief").click();
    await dialog.getByTestId("new-title").fill("Field Notes");
    await dialog.getByTestId("new-topic").fill("Notes");
    await dialog.getByTestId("create-project").click();
    await expect(page.getByTestId("tex-editor")).toBeVisible();
    await expect(page.getByRole("tab", { name: /main\.tex/ })).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /sections/ })).toBeVisible();
    await expect(page.locator(".topbar__title")).toHaveText("Field Notes");
  });
});
