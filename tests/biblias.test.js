import { test } from "node:test";
import assert from "node:assert/strict";
import { crearBiblias, backendMemoria } from "../src/biblias.js";

const biblia = (sigla, texto = "t") => ({ sigla, nombre: `Nombre ${sigla}`, derechos: "©",
  libros: { 1: { 1: { 1: `${texto} gn`, 2: "" } }, 43: { 3: { 16: `${texto} jn` } } },
  resumen: { libros: 2, versiculos: 3, agrupados: 1 } });

test("la primera versión cargada queda como principal; se leen capítulos", async () => {
  const b = crearBiblias(backendMemoria());
  assert.equal(await b.principal(), null);
  await b.guardar(biblia("TLA"));
  await b.guardar(biblia("RVR 1960", "r"));
  assert.equal(await b.principal(), "TLA");
  assert.deepEqual((await b.versiones()).map(v => v.sigla), ["TLA", "RVR 1960"]);
  assert.deepEqual(await b.capitulo("TLA", "GEN", 1), { 1: "t gn", 2: "" });
  assert.deepEqual(await b.capitulo("RVR 1960", "JHN", 3), { 16: "r jn" });
  assert.equal(await b.capitulo("TLA", "EXO", 1), null);
  assert.equal(await b.capitulo("NO", "GEN", 1), null);
});

test("cargar la misma sigla reemplaza el texto y conserva el orden", async () => {
  const be = backendMemoria();
  const b = crearBiblias(be);
  await b.guardar(biblia("TLA", "viejo"));
  await b.guardar(biblia("RVR 1960"));
  await b.guardar(biblia("TLA", "nuevo"));
  assert.deepEqual((await b.versiones()).map(v => v.sigla), ["TLA", "RVR 1960"]);
  assert.equal((await b.capitulo("TLA", "GEN", 1))[1], "nuevo gn");
  assert.equal((await be.keys()).filter(k => k.startsWith("t:TLA:")).length, 2, "se borran los libros viejos");
});

test("si el guardado falla a mitad, la versión anterior sigue intacta (Review Focus 4)", async () => {
  const be = backendMemoria();
  const b = crearBiblias(be);
  await b.guardar(biblia("TLA", "viejo"));
  const put = be.put;
  let n = 0;
  be.put = async (k, v) => { if (++n === 2) throw new Error("QuotaExceededError"); return put(k, v); };
  await assert.rejects(b.guardar(biblia("TLA", "nuevo")));
  be.put = put;
  assert.equal((await b.capitulo("TLA", "GEN", 1))[1], "viejo gn");
});

test("hacerPrincipal y quitar la principal o la única (Review Focus 5)", async () => {
  const b = crearBiblias(backendMemoria());
  await b.guardar(biblia("TLA"));
  await b.guardar(biblia("RVR 1960"));
  await b.hacerPrincipal("RVR 1960");
  assert.equal(await b.principal(), "RVR 1960");
  await b.quitar("RVR 1960");
  assert.equal(await b.principal(), "TLA");
  assert.equal(await b.capitulo("RVR 1960", "GEN", 1), null);
  await b.quitar("TLA");
  assert.equal(await b.principal(), null);
  assert.deepEqual(await b.versiones(), []);
});

test("hacerPrincipal ignora una sigla no cargada", async () => {
  const b = crearBiblias(backendMemoria());
  await b.guardar(biblia("TLA"));
  await b.hacerPrincipal("NO");
  assert.equal(await b.principal(), "TLA");
});
