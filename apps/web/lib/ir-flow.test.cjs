const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

function mod() {
  const source = fs.readFileSync(require.resolve('./ir-flow.ts'), 'utf8');
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports });
  return module.exports;
}

const ir = { nodes: [
  { id: 'gen', kind: 'tool', tool: 'test_generator' },
  { id: 'guard', kind: 'guard', expr: 'n >= 1' },
  { id: 'branch', kind: 'branch', tool: 'if_pay' },
  { id: 'notify', kind: 'tool', tool: 'notify_1' },
  { id: 'review', kind: 'human_gate' },
  { id: 'pub', kind: 'tool', tool: 'publish_problem' },
], edges: [
  { from: 'gen', to: 'guard' }, { from: 'guard', to: 'branch' }, { from: 'branch', to: 'notify' },
  { from: 'notify', to: 'review' }, { from: 'review', to: 'pub' },
] };

test('marks the outgoing edge after a truncated trace', () => {
  const { irToFlow } = mod();
  const { edges } = irToFlow(ir, [], undefined, undefined, 'branch');
  const broke = edges.filter((edge) => edge.source === 'branch');
  assert.equal(broke.length, 1);
  assert.match(String(broke[0].label), /轨迹在此终止/);
});

test('places a linear workflow on one horizontal rail', () => {
  const { irToFlow, dagFrameHeight } = mod();
  const { nodes } = irToFlow(ir, []);
  assert.deepEqual(Array.from(nodes, (n) => n.position.x), [0, 220, 440, 660, 880, 1100]);
  assert.equal(new Set(nodes.map((n) => n.position.y)).size, 1);
  assert.equal(dagFrameHeight({ maxRows: 1, nodeCount: 6 }), 260);
});

test('fork nodes occupy separate centered rails and labels cannot overlap', () => {
  const { irToFlow } = mod();
  const fork = { nodes: [{ id: 'a', kind: 'branch' }, { id: 'b', kind: 'tool' }, { id: 'c', kind: 'tool' }, { id: 'd', kind: 'tool' }], edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }] };
  const { nodes } = irToFlow(fork, []);
  assert.equal(nodes[1].position.x, nodes[2].position.x);
  assert.ok(nodes[2].position.y - nodes[1].position.y >= nodes[1].style.height + 24);
  assert.equal(nodes[0].position.y, (nodes[1].position.y + nodes[2].position.y) / 2);
  assert.ok(nodes[1].position.x > nodes[0].position.x + nodes[0].style.width);
});

test('cycles and dangling edges remain inspectable without overlapping nodes', () => {
  const { irToFlow } = mod();
  const cycle = { nodes: ir.nodes.slice(0, 2), edges: [{ from: 'gen', to: 'guard' }, { from: 'guard', to: 'gen' }, { from: 'absent', to: 'guard' }] };
  const { nodes, edges } = irToFlow(cycle, []);
  assert.equal(new Set(nodes.map((n) => `${n.position.x}:${n.position.y}`)).size, 2);
  assert.equal(edges.length, 2);
});

test('only consecutive witness edges receive path emphasis', () => {
  const { irToFlow } = mod();
  const graph = { ...ir, edges: [...ir.edges, { from: 'gen', to: 'branch' }] };
  const { edges } = irToFlow(graph, [], { nodes: [], path: ['gen', 'guard', 'branch'] });
  assert.equal(edges[0].style.stroke, 'var(--accent)');
  assert.equal(edges.at(-1).style.stroke, 'var(--graph-edge)');
});

test('highlighting keeps every workflow node in the returned graph', () => {
  const { irToFlow } = mod();
  const { nodes } = irToFlow(ir, [], { nodes: ['branch'], path: ['gen', 'guard', 'branch'] });
  assert.equal(nodes.length, 6);
  assert.equal(nodes.find((n) => n.id === 'branch').data.selected, true);
  assert.equal(nodes.find((n) => n.id === 'pub').data.dim, true);
});
