import { expect, test } from "@playwright/test";
import { gotoLibrary, mod } from "./helpers";

test.describe("themes, motion, tooltips, settings", () => {
  test("theme menu switches data-theme and the page colours", async ({ page }) => {
    await gotoLibrary(page);
    const html = page.locator("html");
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitem", { name: /Ink/ }).click();
    await expect(html).toHaveAttribute("data-theme", "ink");
    const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(after).not.toBe(before);
    // settings persist after a short debounce; then the choice survives a reload
    await page.waitForTimeout(600);
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "ink");
  });

  test("motion off removes transitions; fast scales them", async ({ page }) => {
    await gotoLibrary(page);
    await page.getByRole("button", { name: "Animation speed" }).click();
    await page.getByRole("menuitem", { name: /Off/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    const dur = await page.evaluate(() => getComputedStyle(document.querySelector(".btn")!).transitionDuration);
    expect(dur.split(",").every((d) => d.trim() === "0s")).toBe(true);
    await page.getByRole("button", { name: "Animation speed" }).click();
    await page.getByRole("menuitem", { name: /Fast/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "fast");
  });

  test("tooltips appear inside the viewport and face the centre", async ({ page }) => {
    await gotoLibrary(page);
    const settings = page.getByRole("button", { name: "Settings" });
    await settings.hover();
    const tip = page.getByRole("tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Settings");
    const [tipBox, anchorBox, vw, vh] = await Promise.all([tip.boundingBox(), settings.boundingBox(), page.evaluate(() => window.innerWidth), page.evaluate(() => window.innerHeight)]);
    expect(tipBox && anchorBox).toBeTruthy();
    expect(tipBox!.x).toBeGreaterThanOrEqual(0);
    expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(vw);
    expect(tipBox!.y + tipBox!.height).toBeLessThanOrEqual(vh);
    // anchor is in the top half → tooltip below it
    expect(tipBox!.y).toBeGreaterThan(anchorBox!.y + anchorBox!.height - 1);
    expect(await tip.evaluate((el) => getComputedStyle(el).zIndex)).toBe("2147483647");
  });

  test("settings dialog opens with the shortcut, theme cards switch themes", async ({ page }) => {
    await gotoLibrary(page);
    await page.keyboard.press(`${mod}+Comma`);
    const dialog = page.getByTestId("settings-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("theme-graphite").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "graphite");
    await dialog.getByRole("button", { name: "Compiler" }).click();
    await expect(dialog.getByTestId("tex-card")).toContainText(/texbin|latexmk/);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("⌘K opens the command palette, filters as you type and runs the selection", async ({ page }) => {
    await gotoLibrary(page);
    await page.keyboard.press(`${mod}+k`);
    const palette = page.getByTestId("command-palette");
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("textbox")).toBeFocused();
    await expect(palette.getByRole("option").first()).toBeVisible();
    const before = await palette.getByRole("option").count();
    await page.keyboard.type("theme ink");
    await expect.poll(() => palette.getByRole("option").count()).toBeLessThan(before);
    await expect(palette.getByRole("option").first()).toContainText("Theme: Ink");
    await page.keyboard.press("Enter");
    await expect(palette).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
    // shortcuts are shown inside the palette
    await page.keyboard.press(`${mod}+k`);
    await expect(palette.getByRole("textbox")).toBeFocused();
    await page.keyboard.type("open settings");
    await expect(palette.getByRole("option", { name: /Open Settings/ }).locator(".kbd")).toContainText("⌘");
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
  });
});
