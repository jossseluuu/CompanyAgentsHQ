import { expect, test } from "@playwright/test";

test("objetivo de principio a fin en modo simulado", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Nombre", { exact: true }).fill("Dueña");
  await page.getByLabel("Correo").fill("duena@example.com");
  await page.getByLabel(/Contraseña/).fill("contraseña-1");
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await page.getByLabel("Nombre de la empresa").fill("Acme");
  await page.getByLabel("Misión").fill("Vender más");
  await page.getByRole("button", { name: "Crear empresa" }).click();

  await expect(page.getByRole("navigation", { name: "Salas y agentes" }).getByText("Ada")).toBeVisible();
  await expect(page.getByText("● En vivo")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.env.SHOTS + "/01-oficina.png" });

  await page.getByRole("button", { name: "Finanzas", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Dashboard financiero" })).toBeVisible();
  await expect(page.getByText("Ingresos del mes")).toBeVisible();
  await page.screenshot({ path: process.env.SHOTS + "/02-sala.png" });

  await page.getByRole("link", { name: "Objetivos" }).click();
  await page.getByLabel("Título").fill("Lanzar el boletín");
  await page.getByRole("button", { name: "Dar objetivo" }).click();
  await page.getByRole("button", { name: "Aprobar plan" }).click({ timeout: 15000 });
  await expect(page.getByText("Plan de contenidos")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Lanzar el boletín/ }).getByText("Hecha", { exact: false }).or(page.getByRole("heading", { name: /Lanzar el boletín/ }).getByText("done"))).toBeVisible({ timeout: 40000 });
  await page.screenshot({ path: process.env.SHOTS + "/03-objetivo.png" });

  await page.getByRole("link", { name: "Auditoría" }).click();
  await page.getByRole("button", { name: "Verificar integridad" }).click();
  await expect(page.getByRole("status")).toContainText("Cadena íntegra");
  await page.screenshot({ path: process.env.SHOTS + "/04-auditoria.png" });

  await page.getByRole("link", { name: "Oficina" }).click();
  await page.getByRole("navigation", { name: "Salas y agentes" }).getByRole("button", { name: /Gloria/ }).click();
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.getByLabel("Mensaje").fill("¿Cuál es el presupuesto?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.locator("[aria-live=polite]").getByText("documentación")).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: process.env.SHOTS + "/05-chat.png" });
});
