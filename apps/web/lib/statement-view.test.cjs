const assert = require("node:assert/strict");
const test = require("node:test");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");

function loaded() {
  const source = fs.readFileSync(require.resolve("./statement-view.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, { exports: module.exports, module });
  return module.exports;
}

test("keeps 题意/输入/输出 and drops the 样例 block for the statement column", () => {
  const { statementProse } = loaded();
  const source = [
    "# VF1002 课表前缀和",
    "",
    "课表记下了 n 天的课时。",
    "",
    "## 输入",
    "",
    "第一行两个整数 n 和 q。",
    "",
    "## 输出",
    "",
    "共 q 行。",
    "",
    "## 样例",
    "",
    "输入",
    "",
    "```",
    "5 2",
    "```",
    "",
  ].join("\n");
  const prose = statementProse(source);
  assert.match(prose, /## 输入/);
  assert.match(prose, /## 输出/);
  assert.doesNotMatch(prose, /## 样例/);
  assert.doesNotMatch(prose, /5 2/);
});

test("leaves a statement without 样例 unchanged", () => {
  const { statementProse } = loaded();
  const source = "# VF9\n\n只有题意。\n";
  assert.equal(statementProse(source), source);
});
