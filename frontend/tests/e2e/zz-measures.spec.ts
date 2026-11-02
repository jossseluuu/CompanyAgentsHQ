import { expect, test } from "@playwright/test";

/** Mide en un navegador real; se ejecuta tras main-flow, que crea la cuenta. */
test("carga, fps y sincronización entre pestañas", async ({ page, context }) => {
  const started = Date.now();
  await page.goto("/");
  await page.getByLabel("Correo").fill("duena@example.com");
  await page.getByLabel(/Contraseña/).fill("contraseña-1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("● En vivo")).toBeVisible();
  console.log("carga_ms", Date.now() - started);

  // RNF-REN-01 se mide con 20 agentes en la oficina.
  await page.evaluate(async () => {
    const csrf = document.cookie.match(/cahq_csrf=([^;]+)/)?.[1] ?? "";
    const headers = { "Content-Type": "application/json", "X-CSRF-Token": csrf };
    const agents = await (await fetch("/api/v1/agents")).json();
    for (let i = agents.length; i < 20; i += 1) {
      await fetch(`/api/v1/agents/${agents[i % agents.length].id}/clone`, { method: "POST", headers, body: JSON.stringify({ name: `Clon ${i}` }) });
    }
  });
  await page.reload();
  await expect(page.getByText("● En vivo")).toBeVisible();
  await page.waitForTimeout(3000);

  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const step = () => {
          frames += 1;
          if (performance.now() - start < 3000) requestAnimationFrame(step);
          else resolve(frames / 3);
        };
        requestAnimationFrame(step);
      }),
  );
  console.log("fps", fps);

  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByText("● En vivo")).toBeVisible();
  await page.getByRole("button", { name: "⏸ Pausa general" }).click();
  await expect(second.getByRole("button", { name: "▶ Reanudar" })).toBeVisible();
  await second.getByRole("button", { name: "▶ Reanudar" }).click();
  await expect(page.getByRole("button", { name: "⏸ Pausa general" })).toBeVisible();
});
