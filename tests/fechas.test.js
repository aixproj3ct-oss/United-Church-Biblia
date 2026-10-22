import { test } from "node:test";
import assert from "node:assert/strict";
import { proximoDomingo, fechaLarga } from "../src/fechas.js";

const dia = iso => new Date(iso + "T12:00");

test("proximoDomingo: entre semana va al domingo siguiente; el domingo es hoy", () => {
  assert.equal(proximoDomingo(dia("2026-10-21")), "2026-10-25");
  assert.equal(proximoDomingo(dia("2026-10-25")), "2026-10-25");
  assert.equal(proximoDomingo(dia("2026-10-31")), "2026-11-01");
});

test("fechaLarga en español", () => {
  assert.equal(fechaLarga("2026-10-25"), "domingo, 25 de octubre");
});
