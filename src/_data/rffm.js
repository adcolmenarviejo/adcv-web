const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "rffm-snapshots");
const EQUIPOS = ["masculino", "femenino", "aficionados-b"];
const TIPOS = ["resultados", "calendario", "clasificacion"];

function leer(equipo, tipo) {
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
    for (const tipo of TIPOS) {
      data[equipo][tipo] = leer(equipo, tipo);
    }
  }
  return data;
};
