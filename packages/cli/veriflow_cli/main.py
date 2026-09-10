from __future__ import annotations

import argparse
import json
from pathlib import Path

from veriflow_ir.adapter import get_adapter
from veriflow_ir.workflow import WorkflowIR
from veriflow_mutate.ir_faults import mutate_ir
from veriflow_repair.loop import verify_repair_loop
from veriflow_spec.compiler import compile_spec
from veriflow_spec.parser import parse_spec_json
from veriflow_verify.bench import run_fault_bench
from veriflow_verify.result import verify_workflow


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="veriflow")
    sub = parser.add_subparsers(dest="cmd", required=True)

    spec_p = sub.add_parser("spec", help="compile NL to WorkflowSpec")
    spec_p.add_argument("--nl", required=True)
    spec_p.add_argument("--domain", default="compose")

    verify_p = sub.add_parser("verify", help="verify a workflow IR")
    verify_p.add_argument("--workflow", required=True)
    verify_p.add_argument("--nl", default="")
    verify_p.add_argument("--spec", default="")
    verify_p.add_argument("--explain", action="store_true")

    repair_p = sub.add_parser("repair", help="propose guarded patches")
    repair_p.add_argument("--workflow", required=True)
    repair_p.add_argument("--nl", default="")
    repair_p.add_argument("--max-iterations", type=int, default=3)
    repair_p.add_argument("--output", default="")

    loop_p = sub.add_parser("verify-repair", help="verify then guarded repair loop")
    loop_p.add_argument("--workflow", required=True)
    loop_p.add_argument("--nl", default="")
    loop_p.add_argument("--max-iterations", type=int, default=3)
    loop_p.add_argument("--output", default="")

    mut_p = sub.add_parser("mutate", help="inject a ground-truth IR fault")
    mut_p.add_argument("--workflow", required=True)
    mut_p.add_argument("--fault", required=True)
    mut_p.add_argument("--output", default="")

    bench_p = sub.add_parser("bench", help="run IR fault-injection smoke bench")
    bench_p.add_argument("--workflow", default="examples/compose/valid_lis.json")
    bench_p.add_argument("--out", default="experiments/runs/smoke")

    sub.add_parser("report", help="alias of last smoke bench report path")

    args = parser.parse_args(argv)
    if args.cmd == "spec":
        print(compile_spec(args.nl, args.domain).model_dump_json(indent=2))
        return
    if args.cmd == "verify":
        ir = _load_ir(args.workflow)
        spec = parse_spec_json(Path(args.spec).read_text(encoding="utf-8")) if args.spec else compile_spec(args.nl, ir.domain)
        result = verify_workflow(ir, spec)
        payload = result.model_dump(mode="json")
        if not args.explain:
            payload["issues"] = [
                {key: item[key] for key in ("id", "code", "severity", "title", "expected", "actual", "witness_path")}
                for item in payload["issues"]
            ]
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    if args.cmd in {"repair", "verify-repair"}:
        ir = _load_ir(args.workflow)
        spec = compile_spec(args.nl, ir.domain)
        report = verify_repair_loop(ir, spec, max_iterations=args.max_iterations)
        if args.output:
            out = Path(args.output)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(
                json.dumps(report.ir.model_dump(mode="json", by_alias=True), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        print(json.dumps(json.loads(report.model_dump_json()), ensure_ascii=False, indent=2)[:8000])
        return
    if args.cmd == "mutate":
        ir = _load_ir(args.workflow)
        mutated = mutate_ir(ir, args.fault)
        text = json.dumps(mutated.ir.model_dump(mode="json", by_alias=True), ensure_ascii=False, indent=2)
        if args.output:
            Path(args.output).write_text(text, encoding="utf-8")
        print(mutated.model_dump_json(indent=2))
        return
    if args.cmd in {"bench", "report"}:
        ir = _load_ir(args.workflow if args.cmd == "bench" else "examples/compose/valid_lis.json")
        out = Path(args.out) if args.cmd == "bench" else Path("experiments/runs/smoke")
        metrics = run_fault_bench(ir, out)
        print(json.dumps({k: metrics[k] for k in metrics if k != "cases"}, indent=2))
        return


def _load_ir(path: str) -> WorkflowIR:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return get_adapter("compose-json").to_ir(payload)
