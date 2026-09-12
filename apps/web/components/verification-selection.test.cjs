const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

function selection() {
  const source = fs.readFileSync(require.resolve('./verification-selection.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, { exports: module.exports, module });
  return module.exports;
}

test('an issue only focuses nodes present in the current workflow, preserving witness order', () => {
  const { matchingIssueNodes } = selection();
  const issue = { witness_path: ['start', 'missing', 'finish'], minimized_nodes: ['finish'], affected_nodes: ['start'] };
  assert.deepEqual(Array.from(matchingIssueNodes(issue, [{ id: 'start' }, { id: 'finish' }])), ['start', 'finish']);
});

test('an issue with no matching graph node yields an explicit empty selection', () => {
  const { matchingIssueNodes } = selection();
  assert.deepEqual(Array.from(matchingIssueNodes({ affected_nodes: ['external'] }, [{ id: 'start' }])), []);
});
