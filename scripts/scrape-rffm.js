/**
 * scrape-rffm.js
 * ---------------------------------------------------------------
 * La web de la RFFM carga sus datos con JavaScript (no hay una
 * API pública), así que este script abre un navegador invisible
 * (Playwright), entra a cada página, espera a que cargue el
 * contenido real, y EXTRAE SOLO LOS DATOS (resultados, calendario
 * y clasificación) a JSON propio. Nuestra web ya no depende en
 * nada del HTML de RFFM (ni su menú, footer o escudos rotos).
 *
 * - resultados / calendario -> array de partidos:
 *   { local, visitante, golesLocal, golesVisitante, fecha, hora, lugar }
 * - clasificacion -> si RFFM la pinta como <table>, guardamos las
 *   filas tal cual (con sus propias cabeceras) en
 *   <equipo>-clasificacion.json. Si no encontramos una tabla,
 *   caemos de vuelta al volcado de HTML de siempre (con noise de
 *   RFFM) como respaldo, para no dejar la sección vacía.
 *
 * IMPORTANTE: se ha escrito sin poder ver la estructura HTML real
 * de rffm.es (limitación del entorno de desarrollo), localizando
 * los datos por PATRONES en vez de por nombres de clase concretos.
 * Es más robusto ante cambios de diseño, pero conviene revisar el
 * primer resultado real y ajustar si algo no encaja. Si algo va
 * mal, la web sigue funcionando con los últimos datos guardados.
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

// Solo se usan como respaldo de la clasificación si no se encuentra una <table>.
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
    // El alt de los escudos en RFFM es un texto genérico igual para todos
    // ("Escudo equipo local" / "Escudo equipo visitante"), no el nombre
    // real del equipo — hay que descartarlo, no usarlo como nombre.
    const altGenericoRegex = /^escudo(\s+del?)?\s+equipo\s+(local|visitante)$/i;

    const scoreEls = Array.from(document.querySelectorAll("body *")).filter(
      (el) => el.children.length === 0 && scoreRegex.test(el.textContent || "")
    );

    const partidos = [];

    for (const scoreEl of scoreEls) {
      const marcador = scoreEl.textContent.trim();
      const [golesLocal, golesVisitante] = marcador.split("-").map((n) => n.trim());

      let row = scoreEl;
      let fila = null;
      for (let i = 0; i < 8 && row.parentElement; i++) {
        row = row.parentElement;
        if (dateRegex.test(row.textContent) || /Lugar:/i.test(row.textContent)) {
          fila = row;
          break;
        }
      }
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

      const imgs = Array.from(fila.querySelectorAll("img[alt]"))
        .map((i) => i.alt.trim())
        .filter((alt) => alt && !altGenericoRegex.test(alt));

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

/**
 * Extrae la clasificación como filas de tabla (con las cabeceras que
 * use la propia RFFM), si la pintan como <table>. Si no hay ninguna
 * tabla reconocible, devuelve null (el llamante hará un respaldo).
 */
async function extraerClasificacion(page) {
  await esperarContenido(page);

  return await page.evaluate(() => {
    const tablas = Array.from(document.querySelectorAll("table"));
    if (!tablas.length) return null;

    // Nos quedamos con la tabla que más filas tenga (la de clasificación
    // suele ser, con diferencia, la más larga de la página).
    const tabla = tablas.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
    if (tabla.rows.length < 2) return null;

    return Array.from(tabla.rows).map((tr) =>
      Array.from(tr.cells).map((td) => td.textContent.replace(/\s+/g, " ").trim())
    );
  });
}

/** Respaldo (HTML) — solo se usa si la clasificación no viene en una <table>. */
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

      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

        if (tipo === "resultados" || tipo === "calendario") {
          const partidos = await extraerPartidos(page);
          await page.close();
          const outPath = path.join(OUT_DIR, `${equipo.slug}-${tipo}.json`);

          if (partidos && partidos.length) {
            fs.writeFileSync(outPath, JSON.stringify(partidos, null, 2), "utf-8");
            log.resultados.push({ equipo: equipo.slug, tipo, ok: true, partidos: partidos.length });
            console.log(`✅ ${equipo.nombre} — ${tipo}: ${partidos.length} partidos guardados`);
          } else {
            log.resultados.push({ equipo: equipo.slug, tipo, ok: false, motivo: "sin partidos reconocidos" });
            console.warn(`⚠️  ${equipo.nombre} — ${tipo}: no se reconoció ningún partido; se mantiene el archivo anterior si existe`);
          }
        } else {
          // clasificacion
          const filas = await extraerClasificacion(page);

          if (filas) {
            await page.close();
            const outPath = path.join(OUT_DIR, `${equipo.slug}-clasificacion.json`);
            fs.writeFileSync(outPath, JSON.stringify(filas, null, 2), "utf-8");
            log.resultados.push({ equipo: equipo.slug, tipo, ok: true, formato: "tabla", filas: filas.length });
            console.log(`✅ ${equipo.nombre} — clasificación: ${filas.length} filas guardadas (tabla)`);
          } else {
            // Respaldo: si no hay tabla reconocible, volcamos el HTML como antes
            const html = await extraerContenido(page);
            await page.close();
            const outPath = path.join(OUT_DIR, `${equipo.slug}-clasificacion.html`);

            if (html) {
              fs.writeFileSync(outPath, html, "utf-8");
              log.resultados.push({ equipo: equipo.slug, tipo, ok: true, formato: "html-respaldo", bytes: html.length });
              console.warn(`⚠️  ${equipo.nombre} — clasificación: no se encontró <table>, se guardó HTML de respaldo`);
            } else {
              log.resultados.push({ equipo: equipo.slug, tipo, ok: false, motivo: "sin contenido reconocible" });
              console.warn(`⚠️  ${equipo.nombre} — clasificación: no se encontró contenido; se mantiene el archivo anterior si existe`);
            }
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
