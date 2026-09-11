import { selftestAmbient } from "../apps/web/lib/route-ambient.ts";

const failures = selftestAmbient();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("route-ambient ok");
