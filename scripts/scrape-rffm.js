/**
 * scrape-rffm.js
 * ---------------------------------------------------------------
 * La web de la RFFM carga sus datos con JavaScript (no hay una
 * API pública), así que este script abre un navegador invisible
 * (Playwright), entra a cada página, espera a que cargue el
 * contenido real, y guarda ese contenido ya renderizado para
 * que nuestra web lo incluya directamente — sin que nadie tenga
 * que salir a rffm.es.
 *
 * IMPORTANTE — primera ejecución real:
 * Este script se ha escrito sin poder ver la estructura HTML
 * real de rffm.es en directo (limitación del entorno de
 * desarrollo). Es muy probable que, tras la primera ejecución
 * en Netlify, haga falta un pequeño ajuste según lo que
 * realmente devuelva. El script está diseñado para fallar de
 * forma segura: si algo va mal, la web sigue funcionando con
 * los últimos datos guardados en vez de romperse.
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUT_DIR = path.join(__dirname, "..", "src", "_data", "rffm-snapshots");
const LOG_PATH = path.join(__dirname, "..", "src", "_data", "rffm-log.json");

const EQUIPOS = [
  {
    slug: "masculino",
    nombre: "Primer Equipo Masculino",
    resultados:
      "https://www.rffm.es/competicion/resultados-y-jornadas?temporada=21&competicion=24037453&grupo=24037455&jornada=34&tipojuego=1",
    calendario:
      "https://www.rffm.es/competicion/calendario?temporada=21&tipojuego=1&competicion=24037453&grupo=24037455",
    clasificacion:
      "https://www.rffm.es/competicion/clasificaciones?temporada=21&tipojuego=1&competicion=24037453&grupo=24037455",
  },
  {
    slug: "femenino",
    nombre: "Primer Equipo Femenino",
    resultados:
      "https://www.rffm.es/competicion/resultados-y-jornadas?temporada=21&competicion=24038579&grupo=24038586&jornada=22&tipojuego=1",
    calendario:
      "https://www.rffm.es/competicion/calendario?temporada=21&tipojuego=1&competicion=24038579&grupo=24038586",
    clasificacion:
      "https://www.rffm.es/competicion/clasificaciones?temporada=21&tipojuego=1&competicion=24038579&grupo=24038586",
  },
  {
    slug: "aficionados-b",
    nombre: "Aficionados B",
    resultados:
      "https://www.rffm.es/competicion/resultados-y-jornadas?temporada=21&competicion=24037461&grupo=24037463&jornada=34&tipojuego=1",
    calendario:
      "https://www.rffm.es/competicion/calendario?temporada=21&tipojuego=1&competicion=24037461&grupo=24037463",
    clasificacion:
      "https://www.rffm.es/competicion/clasificaciones?temporada=21&tipojuego=1&competicion=24037461&grupo=24037463",
  },
];

// Selectores candidatos para el contenedor principal de contenido.
// El script prueba varios, de más a menos específico, y se queda
// con el primero que encuentre y que tenga texto de verdad dentro.
const CANDIDATOS_CONTENEDOR = [
  "main",
  "#__nuxt main",
  "#__nuxt",
  '[class*="resultado"]',
  '[class*="calendario"]',
  '[class*="clasificacion"]',
  "#app",
  "body",
];

async function extraerContenido(page) {
  // Espera a que la aplicación termine de pintar datos (best-effort:
  // esperamos red inactiva + un margen extra fijo).
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  return await page.evaluate((selectores) => {
    for (const sel of selectores) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 40) {
        // Quitamos scripts y elementos interactivos que no necesitamos
        const clone = el.cloneNode(true);
        clone.querySelectorAll("script, style, noscript, iframe, button, input, form, nav, header, footer").forEach((n) => n.remove());
        return clone.innerHTML;
      }
    }
    return null;
  }, CANDIDATOS_CONTENEDOR);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const log = { ejecutado: new Date().toISOString(), resultados: [] };

  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; ADCVBot/1.0; +https://nueva.adcolmenarviejo.es) — actualización semanal de resultados propios",
  });

  for (const equipo of EQUIPOS) {
    for (const tipo of ["resultados", "calendario", "clasificacion"]) {
      const url = equipo[tipo];
      const outPath = path.join(OUT_DIR, `${equipo.slug}-${tipo}.html`);
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        const html = await extraerContenido(page);
        await page.close();

        if (html) {
          fs.writeFileSync(outPath, html, "utf-8");
          log.resultados.push({ equipo: equipo.slug, tipo, ok: true, bytes: html.length });
          console.log(`✅ ${equipo.nombre} — ${tipo}: ${html.length} caracteres guardados`);
        } else {
          log.resultados.push({ equipo: equipo.slug, tipo, ok: false, motivo: "sin contenido reconocible" });
          console.warn(`⚠️  ${equipo.nombre} — ${tipo}: no se encontró contenido; se mantiene el archivo anterior si existe`);
        }
      } catch (err) {
        log.resultados.push({ equipo: equipo.slug, tipo, ok: false, motivo: String(err && err.message ? err.message : err) });
        console.warn(`⚠️  ${equipo.nombre} — ${tipo}: fallo al cargar (${err.message}); se mantiene el archivo anterior si existe`);
      }
    }
  }

  await browser.close();
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), "utf-8");
  console.log("Hecho. Revisa src/_data/rffm-log.json para ver el detalle de esta ejecución.");
}

main().catch((err) => {
  // Pase lo que pase, no reventamos la compilación de la web entera.
  console.error("El scraper de RFFM falló por completo, pero la web seguirá compilando con los datos anteriores:", err);
  process.exit(0);
});
