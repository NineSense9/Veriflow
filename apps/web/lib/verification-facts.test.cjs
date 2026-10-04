const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const source = fs.readFileSync(require.resolve(file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, { exports: module.exports, module });
  return module.exports;
}

test('workflow READY explains the remaining package validation and human review', () => {
  const text = load('./status.ts').gateWhy('PASS', 'PASS', 'READY');
  assert.match(text, /题包.*校验/);
  assert.match(text, /人工审核/);
  assert.doesNotMatch(text, /可以入库|准予入库|已发布/);
});

test('a missing human gate is described as absent from the workflow', () => {
  const { issueDisplayInfo } = load('./ui-zh.ts');
  const info = issueDisplayInfo({ title: 'if test_generator then human_gate' }, [
    { id: 'gen', kind: 'tool', tool: 'test_generator' },
    { id: 'pub', kind: 'tool', tool: 'publish_problem' },
  ]);
  assert.match(info.subtitle, /图中缺少审题门/);
  assert.doesNotMatch(info.subtitle, /仍在图上/);
});

test('an existing human gate with truncated mock execution is described as unobserved', () => {
  const { issueDisplayInfo } = load('./ui-zh.ts');
  const info = issueDisplayInfo({ title: 'if test_generator then human_gate' }, [
    { id: 'gate', kind: 'gate', tool: 'human_gate' },
  ]);
  assert.match(info.subtitle, /审题门仍在图上/);
  assert.match(info.subtitle, /模拟轨迹/);
});

test('verification demo labels and fallback descriptions identify simulated execution', () => {
  const { demoTitle, DEMO_SCENARIO_ZH, issueDisplayInfo } = load('./ui-zh.ts');
  assert.match(demoTitle('case4_runtime'), /模拟/);
  assert.doesNotMatch(JSON.stringify(DEMO_SCENARIO_ZH.case4_runtime), /沙箱/);
  assert.doesNotMatch(issueDisplayInfo({}).subtitle, /沙箱/);
});

test('action-count evidence preserves the observed count instead of assuming zero', () => {
  const { issueDisplayInfo } = load('./ui-zh.ts');
  const info = issueDisplayInfo({ title: 'exactly once publish_problem', actual: 'count=2' });
  assert.match(info.subtitle, /count=2/);
  assert.doesNotMatch(info.title, /幂等|精准/);
  assert.doesNotMatch(info.subtitle, /次数为 0/);
});

test('the runtime monitor action-count finding is translated using its real constraint code', () => {
  const { issueDisplayInfo } = load('./ui-zh.ts');
  const info = issueDisplayInfo({ title: 'exactly once', code: 'tmp_once_pub', actual: 'count=0' });
  assert.match(info.title, /动作次数/);
  assert.match(info.subtitle, /count=0/);
});

test('missing eventual publication describes the trace evidence without claiming an actual outage', () => {
  const { issueDisplayInfo } = load('./ui-zh.ts');
  const info = issueDisplayInfo({ title: 'eventually publish_problem', actual: 'not in trace' });
  assert.match(info.subtitle, /模拟轨迹/);
  assert.doesNotMatch(info.title + info.subtitle, /致命|异常中断|残缺草稿/);
});
