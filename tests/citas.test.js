import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCita, urlTLA, setRangoEnUrl, getRangoEnUrl, ordenBiblico } from "../src/citas.js";

const OK = [
  ["jn 3 16", "Juan 3:16", "JHN.3.16"], ["jn 3:16", "Juan 3:16", "JHN.3.16"], ["jn 3.16", "Juan 3:16", "JHN.3.16"],
  ["juan3:16", "Juan 3:16", "JHN.3.16"], ["Juan 3:16", "Juan 3:16", "JHN.3.16"], ["JUAN 3 16", "Juan 3:16", "JHN.3.16"],
  ["san juan 3:16", "Juan 3:16", "JHN.3.16"], ["  jn   3  16  ", "Juan 3:16", "JHN.3.16"],
  ["sal 23", "Salmo 23", "PSA.23"], ["salmos 23", "Salmo 23", "PSA.23"], ["Sal 119:105", "Salmo 119:105", "PSA.119.105"],
  ["1 co 13:4-7", "1 Corintios 13:4-7", "1CO.13.4-7"], ["1co 13 4-7", "1 Corintios 13:4-7", "1CO.13.4-7"],
  ["1 cor 13:4-7", "1 Corintios 13:4-7", "1CO.13.4-7"], ["1 corintios 13, 4 al 7", "1 Corintios 13:4-7", "1CO.13.4-7"],
  ["1 co 13 del 4 al 6", "1 Corintios 13:4-6", "1CO.13.4-6"], ["1 co 13 4 al 6", "1 Corintios 13:4-6", "1CO.13.4-6"],
  ["1 co 13 vers 4 a 6", "1 Corintios 13:4-6", "1CO.13.4-6"], ["1 corintios 13 versiculos 4 al 6", "1 Corintios 13:4-6", "1CO.13.4-6"],
  ["primera de corintios 13", "1 Corintios 13", "1CO.13"], ["I Corintios 13:1", "1 Corintios 13:1", "1CO.13.1"],
  ["1a corintios 13:1", "1 Corintios 13:1", "1CO.13.1"], ["2 cor 5 17", "2 Corintios 5:17", "2CO.5.17"],
  ["segunda de timoteo 3:16", "2 Timoteo 3:16", "2TI.3.16"], ["romanos 8", "Romanos 8", "ROM.8"],
  ["ro 8 28", "Romanos 8:28", "ROM.8.28"], ["Rom. 8:28", "Romanos 8:28", "ROM.8.28"],
  ["génesis 1:1", "Génesis 1:1", "GEN.1.1"], ["genesis 1 1", "Génesis 1:1", "GEN.1.1"], ["gn 1", "Génesis 1", "GEN.1"],
  ["Éxodo 20:1-17", "Éxodo 20:1-17", "EXO.20.1-17"], ["is 41:10", "Isaías 41:10", "ISA.41.10"],
  ["isaias 53", "Isaías 53", "ISA.53"], ["ef 2 8-9", "Efesios 2:8-9", "EPH.2.8-9"],
  ["efesios 2:8 al 9", "Efesios 2:8-9", "EPH.2.8-9"], ["tit 2:11-12", "Tito 2:11-12", "TIT.2.11-12"],
  ["flp 4:13", "Filipenses 4:13", "PHP.4.13"], ["fil 4 13", "Filipenses 4:13", "PHP.4.13"],
  ["flm 6", "Filemón 1:6", "PHM.1.6"], ["judas 24-25", "Judas 1:24-25", "JUD.1.24-25"],
  ["abdias 1:4", "Abdías 1:4", "OBA.1.4"], ["3 juan 2", "3 Juan 1:2", "3JN.1.2"], ["1 jn 4:8", "1 Juan 4:8", "1JN.4.8"],
  ["1 juan 1 9", "1 Juan 1:9", "1JN.1.9"], ["apocalipsis 21:4", "Apocalipsis 21:4", "REV.21.4"],
  ["ap 3 20", "Apocalipsis 3:20", "REV.3.20"], ["hch 2 38", "Hechos 2:38", "ACT.2.38"],
  ["mt 28 19-20", "Mateo 28:19-20", "MAT.28.19-20"], ["mr 16 15", "Marcos 16:15", "MRK.16.15"], ["lc 15", "Lucas 15", "LUK.15"],
  ["cantares 2 4", "Cantar de los Cantares 2:4", "SNG.2.4"], ["ecl 3 1", "Eclesiastés 3:1", "ECC.3.1"],
  ["prov 3 5-6", "Proverbios 3:5-6", "PRO.3.5-6"], ["stg 1 5", "Santiago 1:5", "JAS.1.5"], ["heb 11 1", "Hebreos 11:1", "HEB.11.1"],
  ["1 pe 5 7", "1 Pedro 5:7", "1PE.5.7"], ["deuter 6 4", "Deuteronomio 6:4", "DEU.6.4"], ["jn 3 16-16", "Juan 3:16", "JHN.3.16"],
  ["jn 3:16–18", "Juan 3:16-18", "JHN.3.16-18"], ["1 tes 5 17", "1 Tesalonicenses 5:17", "1TH.5.17"],
  ["2 reyes 2 11", "2 Reyes 2:11", "2KI.2.11"], ["1 cronicas 4 10", "1 Crónicas 4:10", "1CH.4.10"], ["joel 2 28", "Joel 2:28", "JOL.2.28"],
];

for (const [entrada, etiqueta, codigoRef] of OK) {
  test(`entiende "${entrada}"`, () => {
    const r = parseCita(entrada);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.etiqueta, etiqueta);
    assert.equal(r.codigoRef, codigoRef);
    assert.equal(r.url, `https://www.bible.com/bible/176/${codigoRef}.TLA`);
  });
}

test("rango invertido se ordena y avisa", () => {
  const r = parseCita("1 co 13 del 7 al 4");
  assert.equal(r.codigoRef, "1CO.13.4-7");
  assert.equal(r.corregido, true);
  assert.equal(parseCita("jn 3 16").corregido, false);
});

const ERR = [
  ["", "Escribe una cita"], ["jn", "capítulo"], ["juan 30", "Juan tiene 21 capítulos"],
  ["sal 151", "Salmos tiene 150 capítulos"], ["jn 0", "Juan tiene 21 capítulos"], ["jn 3 0", "versículo"],
  ["xyz 1 1", "No reconocí"], ["jaun 3 16", "No reconocí"], ["jn 3 16 18", "No entendí los números"],
  ["jn 3 abc", "No entendí los números"], ["joel 4", "Joel tiene 3 capítulos"], ["corintios 13", "¿Cuál?"], ["pedro 1 1", "¿Cuál?"],
];
for (const [entrada, fragmento] of ERR) {
  test(`rechaza "${entrada}"`, () => {
    const r = parseCita(entrada);
    assert.equal(r.ok, false);
    assert.ok(r.error.includes(fragmento), `"${r.error}" no contiene "${fragmento}"`);
  });
}

test("sugerencias útiles", () => {
  assert.ok(parseCita("jaun 3 16").sugerencias.includes("Juan"));
  assert.deepEqual(parseCita("corintios 13").sugerencias, ["1 Corintios", "2 Corintios"]);
  assert.equal(parseCita("jaun 3 16").numeros, "3 16");
});

test("urlTLA arma capítulo, versículo y rango", () => {
  assert.equal(urlTLA({ codigo: "PSA", cap: 23, v1: null, v2: null }), "https://www.bible.com/bible/176/PSA.23.TLA");
  assert.equal(urlTLA({ codigo: "JHN", cap: 3, v1: 16, v2: null }), "https://www.bible.com/bible/176/JHN.3.16.TLA");
  assert.equal(urlTLA({ codigo: "1CO", cap: 13, v1: 4, v2: 7 }), "https://www.bible.com/bible/176/1CO.13.4-7.TLA");
});

test("setRangoEnUrl(false) acorta etiqueta, codigoRef y url al primer versículo", () => {
  setRangoEnUrl(false);
  try {
    const r = parseCita("1 co 13:4-7");
    assert.equal(r.etiqueta, "1 Corintios 13:4");
    assert.equal(r.codigoRef, "1CO.13.4");
    assert.ok(r.url.includes("1CO.13.4.TLA"));
    assert.equal(r.rangoRecortado, true);
  } finally {
    setRangoEnUrl(true);
  }
});

test("normalizar quita º ° ª y secuencia .º", () => {
  const r = parseCita("1º corintios 13");
  assert.equal(r.ok, true);
  assert.equal(r.ref.codigo, "1CO");
});

test("normalizar elimina cap, capitulo, capítulo", () => {
  const r = parseCita("juan cap 3 vers 16");
  assert.equal(r.ok, true);
  assert.equal(r.etiqueta, "Juan 3:16");
  assert.equal(r.codigoRef, "JHN.3.16");
});

test("acepta formato 3v16", () => {
  const r = parseCita("jn 3v16");
  assert.equal(r.ok, true);
  assert.equal(r.etiqueta, "Juan 3:16");
  assert.equal(r.codigoRef, "JHN.3.16");
});

test("ordenBiblico sigue el orden canónico", () => {
  const cs = ["GEN.1.1", "EXO.1", "JHN.3.16", "JHN.3.17", "REV.22"];
  for (let i = 1; i < cs.length; i++) assert.ok(ordenBiblico(cs[i - 1]) < ordenBiblico(cs[i]), cs[i]);
  assert.ok(ordenBiblico("1CO.13.4-7") < ordenBiblico("2CO.1"));
});
