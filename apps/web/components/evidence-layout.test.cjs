const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

function mod() {
  const source = fs.readFileSync(require.resolve('../lib/evidence-layout.ts'), 'utf8');
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, require: () => ({}) });
  return module.exports;
}

test('evidence graph module exposes a local graph selector', () => {
  const { selectEvidenceSubgraph } = mod();
  const entities = [
    { id: 'issue', type: 'Issue', label: 'FAIL' }, { id: 'constraint', type: 'Constraint', label: 'must publish' },
    { id: 'pub', type: 'WorkflowNode', label: 'publish' }, { id: 'event', type: 'RuntimeEvent', label: 'missing' },
    { id: 'unrelated', type: 'Constraint', label: 'unrelated' }, { id: 'run', type: 'VerificationRun', label: 'run' },
  ];
  const relations = [
    { source_id: 'issue', target_id: 'constraint', relation_type: 'DERIVED_FROM' },
    { source_id: 'constraint', target_id: 'pub', relation_type: 'AFFECTS' },
    { source_id: 'pub', target_id: 'event', relation_type: 'OBSERVED_AS' },
    { source_id: 'issue', target_id: 'run', relation_type: 'VERIFIED_BY' },
    { source_id: 'unrelated', target_id: 'run', relation_type: 'VERIFIED_BY' },
  ];
  const graph = selectEvidenceSubgraph(entities, relations, 'issue');
  assert.deepEqual(Array.from(graph.entities, (item) => item.id), ['issue', 'constraint', 'pub', 'run']);
  assert.equal(graph.relations.length, 3);
  assert.deepEqual(Array.from(selectEvidenceSubgraph(entities, [...relations].reverse(), 'issue').entities, (item) => item.id), ['issue', 'constraint', 'pub', 'run']);
});

test('unknown or absent focus has an honest empty state', () => {
  const { selectEvidenceSubgraph } = mod();
  for (const focus of [undefined, 'unknown', 'constraint']) assert.equal(selectEvidenceSubgraph([{ id: 'constraint', type: 'Constraint', label: 'x' }], [], focus).entities.length, 0);
});

test('compact type columns have no gaps and preserve full labels', () => {
  const { layoutEvidence } = mod();
  const graph = layoutEvidence([{ id: 'i', type: 'Issue', label: 'a'.repeat(100) }, { id: 'a', type: 'Algorithm', label: 'algorithm' }]);
  assert.equal(graph.nodes[1].position.x - graph.nodes[0].position.x, 220);
  assert.equal(graph.nodes[0].data.label.length, 100);
});
