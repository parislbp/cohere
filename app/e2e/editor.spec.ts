import { expect, test } from "@playwright/test";
import { SEED, mod, openProject } from "./helpers";

test.describe("editor", () => {
  test("opens with a selected tab, highlighted tokens, tree and outline", async ({ page }) => {
    await openProject(page, SEED.storage);
    await expect(page.getByRole("tab", { selected: true })).toHaveCount(1);
    // syntax highlighting produced styled spans inside CodeMirror
    const styled = page.locator(".cm-content .cm-line span[class*='ͼ']");
    await expect(styled.first()).toBeVisible();
    expect(await styled.count()).toBeGreaterThan(10);
    await expect(page.getByRole("treeitem", { name: /main\.tex/ })).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /references/ })).toBeVisible();
    // folders start expanded; open the first unit file and the outline fills in
    const unit = page.getByRole("treeitem", { name: /_01\.tex/ }).first();
    await unit.click();
    await expect(page.getByRole("tab", { name: /_01\.tex/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tree", { name: "Outline" }).getByRole("treeitem").first()).toBeVisible();
  });

  test("typing marks the tab dirty then autosaves", async ({ page }) => {
    await openProject(page, SEED.scratch);
    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.type("\n% written by the e2e test");
    await expect(page.getByRole("tab", { name: /main\.tex/ }).locator(".tab__dot")).toBeVisible();
    await expect(page.locator(".tabs__save")).toContainText(/saved/i, { timeout: 5000 });
    await expect(page.getByRole("tab", { name: /main\.tex/ }).locator(".tab__dot")).toHaveCount(0);
  });

  test("outline click jumps the editor to the section line", async ({ page }) => {
    await openProject(page, SEED.grant);
    await page.getByRole("treeitem", { name: /_01\.tex/ }).first().click();
    const items = page.getByRole("tree", { name: "Outline" }).getByRole("treeitem");
    await expect(items.first()).toBeVisible();
    await expect.poll(() => items.count()).toBeGreaterThan(1);
    const n = await items.count();
    await items.nth(n - 1).click();
    await expect(items.nth(n - 1)).toHaveClass(/is-current/);
  });

  test("new file via the files header lands in the tree and opens", async ({ page }) => {
    await openProject(page, SEED.scratch);
    await page.getByRole("button", { name: "New file" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("notes");
    await dialog.getByRole("button", { name: "create" }).click();
    await expect(page.getByRole("treeitem", { name: /notes\.tex/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /notes\.tex/ })).toHaveAttribute("aria-selected", "true");
  });

  test("sidebar collapses and expands with the shortcut", async ({ page }) => {
    await openProject(page, SEED.scratch);
    const sidebar = page.locator(".editor__sidebar");
    await expect(sidebar).toHaveCSS("width", /^(?!0px)/);
    await page.keyboard.press(`${mod}+1`);
    await expect(sidebar).toHaveCSS("width", "0px");
    await page.keyboard.press(`${mod}+1`);
    await expect(sidebar).not.toHaveCSS("width", "0px");
  });

  test("⌘B wraps the selection in \\textbf and ⌘I in \\emph", async ({ page }) => {
    await openProject(page, SEED.scratch);
    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.type("\nbold me");
    await page.keyboard.press("Shift+Home");
    await page.keyboard.press(`${mod}+b`);
    await expect(content).toContainText("\\textbf{bold me}");
    // the sidebar did not toggle on ⌘B
    await expect(page.locator(".editor__sidebar")).not.toHaveCSS("width", "0px");
    // the words stay selected inside the wrapper, so ⌘I nests emphasis within the bold
    await page.keyboard.press(`${mod}+i`);
    await expect(content).toContainText("\\textbf{\\emph{bold me}}");
  });

  test("drag a file into a folder moves it", async ({ page }) => {
    await openProject(page, SEED.scratch);
    await page.getByRole("button", { name: "New file" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("loose");
    await dialog.getByRole("button", { name: "create" }).click();
    const file = page.getByRole("treeitem", { name: /^loose\.tex/ });
    await expect(file).toBeVisible();
    const folder = page.getByRole("treeitem", { name: /^figures/ });
    const from = await file.boundingBox();
    const to = await folder.boundingBox();
    expect(from && to).toBeTruthy();
    await page.mouse.move(from!.x + 40, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(from!.x + 60, from!.y + from!.height / 2 + 4, { steps: 3 });
    await page.mouse.move(to!.x + 40, to!.y + to!.height / 2, { steps: 8 });
    await expect(page.locator(".tree-ghost")).toContainText("loose.tex");
    await expect(folder).toHaveClass(/is-drop-target/);
    await page.mouse.up();
    await expect(page.locator('[data-path="figures/loose.tex"]')).toBeVisible();
    await expect(page.locator(".toast")).toContainText(/Moved loose\.tex/);
  });

  test("opens with the whole-document outline and the outputs section folded", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.evaluate(() => localStorage.clear());
    await openProject(page, SEED.mtm);
    await expect(page.getByRole("button", { name: "This file only" })).toBeVisible();
    const items = page.getByRole("tree", { name: "Outline" }).getByRole("treeitem");
    await expect.poll(() => items.count()).toBeGreaterThan(3);
    await expect(page.locator(".onode__file").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Show outputs" })).toBeVisible();
  });

  test("home returns to the library", async ({ page }) => {
    await openProject(page, SEED.scratch);
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  });
});
