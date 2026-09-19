const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

test("CASE 4 golden is the only MiniFlow source of expect/issue/witness", () => {
  const golden = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../../examples/golden/case4_runtime.json"),
      "utf8",
    ),
  );
  assert.equal(golden.expect_static, "PASS");
  assert.equal(golden.expect_runtime, "FAIL");
  assert.equal(golden.expect_gate, "BLOCKED");
  assert.equal(golden.skip_after, "if_pay");
  assert.ok(golden.issue && golden.issue.title);
  assert.ok(Array.isArray(golden.witness) && golden.witness.length >= 2);
  const web = fs.readFileSync(path.resolve(__dirname, "../components/home/VerificationMiniFlow.tsx"), "utf8");
  assert.doesNotMatch(web, /if_pay → terminate/);
  assert.doesNotMatch(web, /expect_gate:\s*"BLOCKED"/);
  assert.match(web, /\.demo\("case4_runtime"\)/);
  assert.match(web, /case4Gate/);
});
