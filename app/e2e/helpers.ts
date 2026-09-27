import { expect, type Page } from "@playwright/test";

export const SEED = {
  mtm: "MTM v1.2 — Market & Technology Model",
  storage: "Storage Revenue Streams",
  convex: "Reading Notes: Convex Optimization",
  grant: "Grant Brief: Long-Duration Storage",
  periodical: "Periodical: Power Markets Quarterly",
  scratch: "Minimal Scratch",
  thesis: "Thesis Outline", // archived
};

export async function gotoLibrary(page: Page) {
  await page.goto("/?mock=1");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByTestId("project-row").first()).toBeVisible();
}

export function row(page: Page, title: string) {
  return page.getByTestId("project-row").filter({ hasText: title });
}

export async function openProject(page: Page, title: string) {
  await gotoLibrary(page);
  await row(page, title).getByRole("button", { name: `Open ${title}` }).click();
  await expect(page.getByTestId("tex-editor")).toBeVisible();
  await expect(page.locator(".cm-content")).toBeVisible();
}

export const mod = process.platform === "darwin" ? "Meta" : "Control";
