import { expect, test } from "@playwright/test";

test("shows OpenVPN status and creates a client", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "VPN Manager" })).toBeVisible();
  await expect(page.getByText("API работает")).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenVPN" })).toBeVisible();
  await expect(page.getByText("Клиентов пока нет")).toBeVisible();

  await page.getByPlaceholder("client_name").fill("e2e_client");
  await page.getByRole("button", { name: "Создать" }).click();

  await expect(page.getByText("e2e_client", { exact: true })).toBeVisible();
  await expect(page.getByText("Client e2e_client registered")).toBeVisible();
});
