/**
 * scrape-rffm.js
 * ---------------------------------------------------------------
 * La web de la RFFM carga sus datos con JavaScript (no hay una
 * API pública), así que este script abre un navegador invisible
 * (Playwright), entra a cada página, espera a que cargue el
 * contenido real, y EXTRAE SOLO LOS DATOS de cada partido
 * (equipos, marcador, fecha, hora, lugar) a un JSON propio.
 *
 * A diferencia de la versión anterior, ya NO copiamos el HTML
 * de RFFM (eso arrastraba su menú, footer, patrocinadores, etc.
 * y escudos rotos por hotlinking). Ahora guardamos datos limpios
 * en src/_data/rffm-snapshots/<equipo>-<tipo>.json, y es la
 * plantilla de nuestra web la que pinta la tabla con el estilo
 * de ADCV.
 *
 * IMPORTANTE — primera ejecución real:
 * El script se ha escrito sin poder ver la estructura HTML real
 * de rffm.es en directo (limitación del entorno de desarrollo),
 * así que localiza los datos por PATRONES (dónde aparece un
 * marcador tipo "2 - 0", una fecha, "Lugar:", etc.) en vez de
 * por nombres de clase concretos — es más robusto, pero conviene
 * revisar el primer resultado real y ajustar si algo no encaja.
 * Si algo va mal, la web sigue funcionando con los últimos datos
 * guardados en vez de romperse.
 *
 * NOTA: la extracción de "clasificacion" (tabla de posiciones)
 * se mantiene igual que antes (captura de HTML) porque tiene una
 * estructura distinta (tabla de liga) que aún no hemos revisado.
 * Se puede migrar a JSON en un segundo paso.
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

// Selectores candidatos para el contenedor principal (solo se usan
// para clasificación, que aún se captura como HTML de respaldo).
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

async function esperarContenido(page) {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

/**
 * Extrae partidos (resultados o calendario) como datos estructurados,
 * localizándolos por patrones en vez de por clases CSS concretas.
 */
async function extraerPartidos(page) {
  await esperarContenido(page);

  return await page.evaluate(() => {
    const scoreRegex = /^\s*\d{1,2}\s*-\s*\d{1,2}\s*$/;
    const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;
    const timeRegex = /(\d{2}:\d{2})h/;

    // 1. Elementos "hoja" (sin hijos) cuyo texto es justo un marcador "N - N"
    const scoreEls = Array.from(document.querySelectorAll("body *")).filter(
      (el) => el.children.length === 0 && scoreRegex.test(el.textContent || "")
    );

    const partidos = [];

    for (const scoreEl of scoreEls) {
      const marcador = scoreEl.textContent.trim();
      const [golesLocal, golesVisitante] = marcador.split("-").map((n) => n.trim());

      // 2. Sube hasta el contenedor del partido (el que ya incluye fecha o "Lugar:")
      let row = scoreEl;
      let fila = null;
      for (let i = 0; i < 8 && row.parentElement; i++) {
        row = row.parentElement;
        if (dateRegex.test(row.textContent) || /Lugar:/i.test(row.textContent)) {
          fila = row;
          break;
        }
      }
      // Si no hay fecha/lugar (p. ej. en jornadas pasadas del calendario), usamos
      // un contenedor algo más amplio igualmente, mientras no mezcle varios partidos.
      if (!fila) {
        row = scoreEl;
        for (let i = 0; i < 4 && row.parentElement; i++) row = row.parentElement;
        fila = row;
      }

      const textoFila = fila.textContent.replace(/\s+/g, " ").trim();
      const fecha = (textoFila.match(dateRegex) || [])[1] || null;
      const hora = (textoFila.match(timeRegex) || [])[1] || null;
      const lugarMatch = textoFila.match(/Lugar:\s*(.+?)\s*(?:\(HA\)|VER ACTA)/i);
      const lugar = lugarMatch ? lugarMatch[1].trim() : null;

      // 3. Nombres de equipo: preferimos el alt de los escudos (más fiable);
      //    si no hay, deducimos el texto justo antes/después del marcador.
      const imgs = Array.from(fila.querySelectorAll("img[alt]"))
        .map((i) => i.alt.trim())
        .filter(Boolean);

      let local = null;
      let visitante = null;

      if (imgs.length >= 2) {
        local = imgs[0];
        visitante = imgs[1];
      } else {
        const idx = textoFila.indexOf(marcador);
        if (idx > -1) {
          const antes = textoFila.slice(0, idx).trim();
          const despues = textoFila.slice(idx + marcador.length).trim();
          local = antes || null;
          visitante =
            despues
              .split(/Lugar:|VER ACTA/i)[0]
              .replace(dateRegex, "")
              .replace(timeRegex, "")
              .replace(/h\s*$/, "")
              .trim() || null;
        }
      }

      if (local || visitante) {
        partidos.push({ local, visitante, golesLocal, golesVisitante, fecha, hora, lugar });
      }
    }

    return partidos;
  });
}

/** Extracción de respaldo (HTML) — se mantiene solo para clasificación por ahora. */
async function extraerContenido(page) {
  await esperarContenido(page);

  return await page.evaluate((selectores) => {
    for (const sel of selectores) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 40) {
        const clone = el.cloneNode(true);
        clone
          .querySelectorAll("script, style, noscript, iframe, button, input, form, nav, header, footer")
          .forEach((n) => n.remove());
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
      const esEstructurado = tipo === "resultados" || tipo === "calendario";
      const outPath = path.join(
        OUT_DIR,
        `${equipo.slug}-${tipo}.${esEstructurado ? "json" : "html"}`
      );

      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

        if (esEstructurado) {
          const partidos = await extraerPartidos(page);
          await page.close();

          if (partidos && partidos.length) {
            fs.writeFileSync(outPath, JSON.stringify(partidos, null, 2), "utf-8");
            log.resultados.push({ equipo: equipo.slug, tipo, ok: true, partidos: partidos.length });
            console.log(`✅ ${equipo.nombre} — ${tipo}: ${partidos.length} partidos guardados`);
          } else {
            log.resultados.push({ equipo: equipo.slug, tipo, ok: false, motivo: "sin partidos reconocidos" });
            console.warn(`⚠️  ${equipo.nombre} — ${tipo}: no se reconoció ningún partido; se mantiene el archivo anterior si existe`);
          }
        } else {
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
