const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "rffm-snapshots");
const EQUIPOS = ["masculino", "femenino", "aficionados-b"];

function leerPartidos(equipo, tipo) {
  const file = path.join(DIR, `${equipo}-${tipo}.json`);
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const partidos = JSON.parse(raw);
    return Array.isArray(partidos) ? partidos : [];
  } catch (e) {
    return [];
  }
}

function leerClasificacion(equipo) {
  const jsonFile = path.join(DIR, `${equipo}-clasificacion.json`);
  try {
    const raw = fs.readFileSync(jsonFile, "utf-8");
    const filas = JSON.parse(raw);
    if (Array.isArray(filas) && filas.length) {
      return { formato: "tabla", filas };
    }
  } catch (e) {
    // seguimos al respaldo
  }

  const htmlFile = path.join(DIR, `${equipo}-clasificacion.html`);
  try {
    const html = fs.readFileSync(htmlFile, "utf-8");
    return { formato: "html", html };
  } catch (e) {
    // seguimos al vacío
  }

  return { formato: "vacio" };
}

module.exports = function () {
  const data = {};
  for (const equipo of EQUIPOS) {
    data[equipo] = {
      resultados: leerPartidos(equipo, "resultados"),
      calendario: leerPartidos(equipo, "calendario"),
      clasificacion: leerClasificacion(equipo),
    };
  }
  return data;
};
