/**
 * scrape-rffm.js
 * ---------------------------------------------------------------
 * La web de la RFFM carga sus datos con JavaScript, así que este
 * script abre un navegador invisible (Playwright), entra a cada
 * página, espera a que cargue el contenido real, y en vez de
 * intentar "limpiar" ruido quitando cosas una por una, busca
 * directamente el bloque que contiene los partidos de verdad
 * (siempre llevan el texto "VER ACTA") y se queda solo con eso.
 * Así no se cuelan avisos, buscadores ni menús de la RFFM.
 *
 * Para Clasificación (que no tiene "VER ACTA"), se usa un método
 * de respaldo: eliminar los bloques de ruido conocidos por su
 * texto y quedarse con el contenedor más pequeño que aún tenga
 * datos reales.
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
  "script",
  "style",
  "noscript",
  "iframe",
  "button",
  "input",
  "form",
];

const FRASES_RUIDO = [
  "Su privacidad es importante para nosotros",
  "¡Escribe lo que estás buscando y presiona Enter",
  "Avisos de interés",
  "Nota informativa",
  "FILTRO DE BÚSQUEDAS",
];

async function limpiarRuidoBasico(page) {
  await page.evaluate((selectores) => {
    selectores.forEach((sel) => {
      document.querySelectorAll(sel).forEach((n) => n.remove());
    });
  }, SELECTORES_RUIDO);
}

async function extraerPorMarcador(page, marcador) {
  return await page.evaluate((marcadorTexto) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodos = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.includes(marcadorTexto)) nodos.push(n);
    }
    if (nodos.length < 3) return null;

    function ancestros(nodo) {
      const lista = [];
      let el = nodo.parentElement;
      while (el) {
        lista.push(el);
        el = el.parentElement;
      }
      return lista;
    }
    let comunes = ancestros(nodos[0]);
    for (let i = 1; i < nodos.length; i++) {
      const setActual = new Set(ancestros(nodos[i]));
      comunes = comunes.filter((el) => setActual.has(el));
    }
    if (!comunes.length) return null;
    let contenedor = comunes[0];

    const clone = contenedor.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, iframe, button, input, form").forEach((el) => el.remove());
    return clone.innerHTML;
  }, marcador);
}

async function extraerPorLimpieza(page) {
  return await page.evaluate((frasesRuido) => {
    function eliminarBloquePorTexto(frase) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodos = [];
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeValue && n.nodeValue.includes(frase)) nodos.push(n);
      }
      nodos.forEach((textNode) => {
        let el = textNode.parentElement;
        let saltos = 0;
        while (el && saltos < 6) {
          const tag = el.tagName ? el.tagName.toLowerCase() : "";
          if (["div", "section", "aside", "form", "li", "ul"].includes(tag) && el.innerText.length < 6000) {
            el.remove();
            return;
          }
          el = el.parentElement;
          saltos++;
        }
      });
    }
    frasesRuido.forEach(eliminarBloquePorTexto);

    for (const sel of ["main", "#__nuxt main", "#__nuxt", "#app", "body"]) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 40) {
        return el.innerHTML;
      }
    }
    return null;
  }, FRASES_RUIDO);
}

async function extraerContenido(page, tipo) {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  await limpiarRuidoBasico(page);

  if (tipo === "resultados" || tipo === "calendario") {
    const html = await extraerPorMarcador(page, "VER ACTA");
    if (html) return html;
  }
  return await extraerPorLimpieza(page);
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
        const html = await extraerContenido(page, tipo);
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
