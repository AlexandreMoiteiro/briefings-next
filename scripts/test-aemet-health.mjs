import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAemetHealth } from "../src/lib/aemet-health.ts";

const when = new Date("2026-11-04T18:35:00Z");
const levels = ["020", "050", "100", "150"];
const sigwx = [{ name: "2026-11-04_18.png" }, { name: "2026-11-05_00.png" }];
function wind(run, cycle, leads, chosenLevels = levels) {
  return chosenLevels.flatMap((fl) => leads.map((lead) => ({
    name: `${run}_HMAR${cycle}_H${String(lead).padStart(3, "0")}_FL${fl}.png`,
  })));
}
const oldRun = wind("20261104", "00", [18, 21, 24, 27, 30]);
const newRun = wind("20261104", "12", [9, 12, 15, 18, 21]);

test("a delayed 12Z run is informational while older charts provide coverage", () => {
  const result = evaluateAemetHealth(sigwx, oldRun, when);
  assert.equal(result.severity, "warning");
  assert.equal(result.problems.length, 4);
  assert.ok(result.problems.every((problem) => problem.includes("existem ainda cartas")));
});

test("a recent run with near-term charts is healthy", () => {
  const result = evaluateAemetHealth(sigwx, newRun, when);
  assert.equal(result.severity, "healthy");
  assert.equal(result.healthy, true);
  assert.equal(result.problems.length, 0);
});

test("an absent flight level is critical even when other levels are merely delayed", () => {
  const result = evaluateAemetHealth(sigwx, wind("20261104", "00", [18, 21, 24, 27, 30], levels.slice(0, 3)), when);
  assert.equal(result.severity, "critical");
  assert.ok(result.problems.some((problem) => problem.includes("FL150")));
});

test("near-term outlook expiring becomes critical", () => {
  const result = evaluateAemetHealth(sigwx, oldRun, new Date("2026-11-05T04:35:00Z"));
  assert.equal(result.severity, "critical");
  assert.ok(result.problems.some((problem) => problem.includes("cobertura adequada")));
});

test("missing or stale SIGWX is critical even when Wind/Temp is updated", () => {
  const result = evaluateAemetHealth([{ name: "2026-11-04_06.png" }], newRun, when);
  assert.equal(result.severity, "critical");
  assert.ok(result.problems.some((problem) => problem.includes("SIGWX")));
});

test("unrecognised chart names never count as valid coverage", () => {
  const result = evaluateAemetHealth(sigwx, [{ name: "invalid.png" }], when);
  assert.equal(result.severity, "critical");
});
