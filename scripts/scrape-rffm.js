/**
 * scrape-rffm.js
 * ---------------------------------------------------------------
 * Abre un navegador invisible (Playwright), entra a cada página de
 * la RFFM, espera a que cargue el contenido real, LIMPIA el ruido
 * que no queremos (aviso de cookies, buscador, avisos de interés)
 * y guarda el resto para que nuestra web lo incluya directamente.
 *
 * Este archivo ya incorpora los ajustes de la primera ejecución
 * real (los textos de limpieza de abajo están sacados de lo que
 * la RFFM devolvió de verdad la primera vez que se conectó).
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

// Selectores candidatos para el contenedor principal de contenido,
// de más específico a más general.
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

// Selectores habituales de banners de cookies (OneTrust, Cookiebot,
// Quantcast, CookieYes y variantes genéricas) — se eliminan siempre
// que aparezcan, antes de capturar el contenido.
const SELECTORES_RUIDO = [
  "#onetrust-banner-sdk",
  "#onetrust-consent-sdk",
  ".onetrust-pc-dark-filter",
  ".qc-cmp2-container",
  "#qc-cmp2-container",
  ".cookiebot",
  '[id*="cookie" i]',
  '[class*="cookie" i]',
  '[id*="consent" i]',
  '[class*="consent" i]',
  '[class*="cmp-container" i]',
  "script",
  "style",
  "noscript",
  "iframe",
  "button",
  "input",
  "form",
  "nav",
  "header",
  "footer",
];

// Frases exactas vistas en la primera ejecución real: si aparecen,
// se elimina el bloque contenedor más cercano que las envuelve.
const FRASES_RUIDO = [
  "Su privacidad es importante para nosotros",
  "¡Escribe lo que estás buscando y presiona Enter",
  "Avisos de interés",
  "FILTRO DE BÚSQUEDAS",
];

async function limpiarYExtraer(page) {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  return await page.evaluate(
    ({ selectoresContenedor, selectoresRuido, frasesRuido }) => {
      // 1) Quita banners de cookies y elementos que no necesitamos
      selectoresRuido.forEach((sel) => {
        document.querySelectorAll(sel).forEach((n) => n.remove());
      });

      // 2) Quita bloques que contengan alguna de las frases de ruido
      //    conocidas (buscador, avisos, filtros de la RFFM).
      function eliminarBloquePorTexto(frase) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodos = [];
        let n;
        while ((n = walker.nextNode())) {
          if (n.nodeValue && n.nodeValue.includes(frase)) nodos.push(n);
        }
        nodos.forEach((textNode) => {
          // Sube hasta encontrar un bloque razonable (div/section/aside)
          // para eliminar el widget completo, sin borrar de más ni de menos.
          let el = textNode.parentElement;
          let saltos = 0;
          while (el && saltos < 6) {
            const tag = el.tagName ? el.tagName.toLowerCase() : "";
            if (["div", "section", "aside", "form"].includes(tag) && el.innerText.length < 4000) {
              el.remove();
              return;
            }
            el = el.parentElement;
            saltos++;
          }
        });
      }
      frasesRuido.forEach(eliminarBloquePorTexto);

      // 3) Busca el contenedor principal ya limpio
      for (const sel of selectoresContenedor) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim().length > 40) {
          return el.innerHTML;
        }
      }
      return null;
    },
    { selectoresContenedor: CANDIDATOS_CONTENEDOR, selectoresRuido: SELECTORES_RUIDO, frasesRuido: FRASES_RUIDO }
  );
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
        const html = await limpiarYExtraer(page);
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
  console.error("El scraper de RFFM falló por completo, pero la web seguirá compilando con los datos anteriores:", err);
  process.exit(0);
});
