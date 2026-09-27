/** Updates, the private TeX installer and Remove Cohere — all against the simulated backend. */
import { expect, test } from "@playwright/test";
import { gotoLibrary, mod } from "./helpers";

test.describe("updates", () => {
  test("an available release opens the update dialog at launch; install streams progress and reaches relaunch", async ({ page }) => {
    await page.goto("/?mock=1&update=0.9.0");
    const dialog = page.getByTestId("update-dialog");
    await expect(dialog).toBeVisible({ timeout: 8000 });
    await expect(dialog).toContainText("Cohere 0.9.0 is ready");
    await expect(dialog.getByTestId("release-notes")).toContainText("Install TeX for Cohere");
    await expect(dialog.locator("code")).toContainText("\\typeout");
    await expect(dialog).toContainText("you have 0.1.0-mock");
    await dialog.getByTestId("update-install").click();
    await expect(dialog).toContainText(/downloading/);
    await expect(dialog).toContainText(/relaunching Cohere/, { timeout: 8000 });
  });

  test("later hides the dialog for the session; About shows the offer and check-now reopens it", async ({ page }) => {
    await page.goto("/?mock=1&update=0.9.0");
    const dialog = page.getByTestId("update-dialog");
    await expect(dialog).toBeVisible({ timeout: 8000 });
    await dialog.getByTestId("update-later").click();
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press(`${mod}+,`);
    await page.getByTestId("settings-dialog").getByRole("button", { name: "About", exact: true }).click();
    await expect(page.getByTestId("update-status")).toContainText("version 0.9.0 is available");
    await page.getByTestId("update-check").click();
    await expect(page.getByTestId("update-dialog")).toBeVisible();
  });

  test("with nothing newer, About reports up to date after check now", async ({ page }) => {
    await gotoLibrary(page);
    await page.keyboard.press(`${mod}+,`);
    await page.getByTestId("settings-dialog").getByRole("button", { name: "About", exact: true }).click();
    await page.getByTestId("update-check").click();
    await expect(page.getByTestId("update-status")).toContainText("up to date");
    await expect(page.getByTestId("update-dialog")).toHaveCount(0);
  });
});

test.describe("TeX for Cohere", () => {
  test("no TeX → nudge, install dialog runs all four steps and the compiler card shows the private install", async ({ page }) => {
    await page.goto("/?mock=1&notex=1");
    await expect(page.getByRole("status").filter({ hasText: "No TeX installation found" })).toBeVisible({ timeout: 6000 });
    await page.getByRole("button", { name: "Install TeX for Cohere" }).click();
    const dialog = page.getByTestId("tex-install-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("about 400 MB");
    await dialog.getByTestId("tex-install-start").click();
    await expect(dialog.getByTestId("tex-step-download")).toHaveAttribute("data-state", "active");
    await expect(dialog.getByTestId("tex-step-packages")).toHaveAttribute("data-state", "active", { timeout: 10000 });
    await expect(dialog.getByTestId("tex-install-done")).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByTestId("tex-step-verify")).toHaveAttribute("data-state", "done");
    await dialog.getByRole("button", { name: "done" }).click();
    await page.keyboard.press(`${mod}+,`);
    await page.getByTestId("settings-dialog").getByRole("button", { name: "Compiler", exact: true }).click();
    await expect(page.getByTestId("tex-card")).toContainText("Cohere ·");
    await expect(page.getByTestId("tex-card").getByRole("button", { name: "remove" })).toBeVisible();
  });

  test("cancel stops the run and offers to try again", async ({ page }) => {
    await page.goto("/?mock=1&notex=1");
    await expect(page.getByTestId("project-row").first()).toBeVisible();
    await page.keyboard.press(`${mod}+,`);
    await page.getByTestId("settings-dialog").getByRole("button", { name: "Compiler", exact: true }).click();
    await page.getByTestId("tex-install-open").click();
    const dialog = page.getByTestId("tex-install-dialog");
    await dialog.getByTestId("tex-install-start").click();
    await dialog.getByTestId("tex-install-cancel").click();
    await expect(dialog).toContainText("Installation cancelled");
    await expect(dialog.getByRole("button", { name: "try again" })).toBeVisible();
  });
});

test.describe("remove Cohere", () => {
  test("the dialog lists the footprint and confirms the move to the Trash", async ({ page }) => {
    await gotoLibrary(page);
    await page.keyboard.press(`${mod}+,`);
    await page.getByTestId("settings-dialog").getByRole("button", { name: "About", exact: true }).click();
    await page.getByTestId("remove-open").click();
    const dialog = page.getByTestId("remove-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/\d+ projects and their versions/);
    await expect(dialog).toContainText("/Applications/Cohere.app");
    await dialog.getByRole("checkbox").click(); // skip the export so no folder picker is needed
    await expect(dialog.getByTestId("remove-confirm")).toHaveText("remove");
    await dialog.getByTestId("remove-confirm").click();
    await expect(dialog).toContainText("2 items moved to the Trash");
  });
});
