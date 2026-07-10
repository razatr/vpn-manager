import { expect, test } from "@playwright/test";

test("shows OpenVPN status and creates a client", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "VPN Manager" })).toBeVisible();
  await expect(page.getByText("API работает")).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenVPN", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "VLESS", exact: true })).toBeVisible();
  await expect(page.locator("#openvpn-clients").getByText("Клиентов пока нет", { exact: true })).toBeVisible();

  await page.locator("#client-name").fill("e2e_client");
  await page.locator("#client-form").getByRole("button", { name: "Создать" }).click();

  await expect(page.getByText("e2e_client", { exact: true })).toBeVisible();
  await expect(page.getByText("Client e2e_client registered")).toBeVisible();
});
