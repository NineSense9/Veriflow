const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function renderStepper(effects, currentStep) {
  const source = fs.readFileSync(require.resolve('./reactbits/Stepper.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, { exports: module.exports, module, require: (id) => {
    if (id.endsWith('.css')) return {};
    if (id === '@/lib/effects') return { useEffects: () => ({ effects }) };
    return require(id);
  } });
  const { default: Stepper, Step } = module.exports;
  return renderToStaticMarkup(React.createElement(Stepper, {
    currentStep, statuses: ['PASS', 'FAIL', 'NOT_RUN'], labels: ['Compile', 'Verify', 'Gate'], hideFooter: true,
  }, ...['compiled', 'verification failed', 'not executed'].map((text) => React.createElement(Step, { key: text }, text))));
}

test('selecting a later pipeline step never turns a failed verifier into a completed state', () => {
  const markup = renderStepper('off', 3);
  assert.match(markup, /data-status="FAIL" aria-label="Verify · FAIL"/);
  assert.doesNotMatch(markup, /class="step-indicator[^"]*complete/);
  assert.match(markup, /aria-label="Gate · NOT_RUN" aria-current="step"/);
});

test('reduced and off effects show the current step details without a motion wrapper', () => {
  for (const effects of ['reduced', 'off']) {
    const markup = renderStepper(effects, 2);
    assert.match(markup, /verification failed/);
    assert.doesNotMatch(markup, /transform:|height:0|opacity:0/);
  }
});
