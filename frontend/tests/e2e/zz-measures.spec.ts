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
