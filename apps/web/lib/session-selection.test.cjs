const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

function selection() {
  const source = fs.readFileSync(require.resolve('./session-selection.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, { exports: module.exports, module });
  return module.exports;
}

test('a recorded re-verify PASS remains selected instead of falling back to the demo', () => {
  const { shouldLoadDemoWhenOpening } = selection();
  assert.equal(shouldLoadDemoWhenOpening({ hasLatestRun: true }), false);
});

test('an empty history loads the configured demo case', () => {
  const { shouldLoadDemoWhenOpening } = selection();
  assert.equal(shouldLoadDemoWhenOpening({ hasLatestRun: false }), true);
});
