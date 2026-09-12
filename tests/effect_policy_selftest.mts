import assert from "node:assert/strict";
import { resolveEffects, effectsAllowBackground, effectsAllowPointer, effectsAllowScan } from "../apps/web/lib/effect-policy.ts";

for (const level of ["full", "balanced", "reduced", "off"] as const) {
  assert.equal(resolveEffects(level, false), level);
  assert.equal(effectsAllowPointer(level), level === "full");
  assert.equal(effectsAllowBackground(level), ["full", "balanced"].includes(level));
  assert.equal(effectsAllowScan(level), ["full", "balanced"].includes(level));
}
assert.equal(resolveEffects("full", true), "reduced");
assert.equal(resolveEffects("balanced", true), "reduced");
assert.equal(resolveEffects("off", true), "off");
console.log("Effect policy: all checks passed");
