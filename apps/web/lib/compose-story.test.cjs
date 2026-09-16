const assert = require("node:assert/strict");
const test = require("node:test");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");

function loaded() {
  const source = fs.readFileSync(require.resolve("./compose-story.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, { exports: module.exports, module });
  return module.exports;
}

test("MISSING_HUMAN_GATE is explained in plain Chinese", () => {
  const { explainCode, storyFindings, gatePlain } = loaded();
  const text = explainCode("MISSING_HUMAN_GATE");
  assert.match(text.title, /审题/);
  assert.doesNotMatch(text.detail, /human_gate/);
  const findings = storyFindings({
    errors: [{ code: "MISSING_HUMAN_GATE", message: "publish_problem requires a human_gate on every path" }],
    attack: [],
    verification: { issues: [{ code: "MISSING_HUMAN_GATE", title: "x", description: "y" }] },
  });
  assert.equal(findings.length, 1);
  assert.equal(gatePlain("BLOCKED"), "还不能进库");
});
