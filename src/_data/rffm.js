const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "rffm-snapshots");
const EQUIPOS = ["masculino", "femenino", "aficionados-b"];
const TIPOS_JSON = ["resultados", "calendario"];
const TIPOS_HTML = ["clasificacion"];

function leerJSON(equipo, tipo) {
  const file = path.join(DIR, `${equipo}-${tipo}.json`);
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const partidos = JSON.parse(raw);
    return Array.isArray(partidos) ? partidos : [];
  } catch (e) {
    return [];
  }
}

function leerHTML(equipo, tipo) {
  const file = path.join(DIR, `${equipo}-${tipo}.html`);
  try {
    return fs.readFileSync(file, "utf-8");
  } catch (e) {
    return '<p style="padding:20px;color:#9b9b9b;font-size:14px;">Sin datos todavía.</p>';
  }
}

module.exports = function () {
  const data = {};
  for (const equipo of EQUIPOS) {
    data[equipo] = {};
    for (const tipo of TIPOS_JSON) {
      data[equipo][tipo] = leerJSON(equipo, tipo);
    }
    for (const tipo of TIPOS_HTML) {
      data[equipo][tipo] = leerHTML(equipo, tipo);
    }
  }
  return data;
};
