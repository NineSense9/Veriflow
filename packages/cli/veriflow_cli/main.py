from __future__ import annotations

import argparse
import json
import sys
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
    bench_p.add_argument("--suite", default="smoke", choices=["smoke", "dev"])

    gate_p = sub.add_parser("gate", help="CI reliability gate")
    gate_p.add_argument("--workflow", required=True)
    gate_p.add_argument("--nl", default="")
    gate_p.add_argument("--spec", default="")
    gate_p.add_argument("--policy", default="")
    gate_p.add_argument("--no-runtime", action="store_true")
    gate_p.add_argument("--report", default="")
    gate_p.add_argument("--junit", default="")
    gate_p.add_argument("--skip-after", default="")

    rt_p = sub.add_parser("runtime", help="mock-execute and check temporal conformance")
    rt_p.add_argument("--workflow", required=True)
    rt_p.add_argument("--nl", default="")
    rt_p.add_argument("--skip-after", default="")

    inc_p = sub.add_parser("incremental", help="diff + incremental verify")
    inc_p.add_argument("--before", required=True)
    inc_p.add_argument("--after", required=True)
    inc_p.add_argument("--nl", default="")

    sub.add_parser("report", help="alias of last smoke bench report path")

    args = parser.parse_args(argv)
    try:
        _dispatch(args)
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — CLI tool errors must be exit 2, not gate fail
        print(json.dumps({"error": str(exc), "exit_code": 2}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(2) from exc


def _dispatch(args) -> None:
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
        out = Path(args.out) if args.cmd == "bench" else Path("experiments/runs/smoke")
        if getattr(args, "suite", "smoke") == "dev":
            from veriflow_verify.bench import run_dev_bench

            metrics = run_dev_bench(Path(__file__).resolve().parents[3], out)
        else:
            ir = _load_ir(args.workflow if args.cmd == "bench" else "examples/compose/valid_lis.json")
            metrics = run_fault_bench(ir, out)
        print(json.dumps({k: metrics[k] for k in metrics if k != "cases"}, indent=2))
        return
    if args.cmd == "gate":
        from veriflow_verify.gate import evaluate_gate, load_policy, render_junit, render_markdown

        ir = _load_ir(args.workflow)
        spec = parse_spec_json(Path(args.spec).read_text(encoding="utf-8")) if args.spec else compile_spec(args.nl, ir.domain)
        policy = load_policy(args.policy or None)
        result = evaluate_gate(
            ir,
            spec,
            run_runtime=not args.no_runtime,
            policy=policy,
            skip_after=args.skip_after or None,
        )
        print(result.model_dump_json(indent=2))
        if args.report:
            out = Path(args.report)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(render_markdown(result), encoding="utf-8")
        if args.junit:
            out = Path(args.junit)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(render_junit(result), encoding="utf-8")
        raise SystemExit(result.exit_code)
    if args.cmd == "runtime":
        from veriflow_runtime.mock_exec import mock_execute
        from veriflow_runtime.monitor import monitor_trace
        from veriflow_runtime.cross import cross_verify

        ir = _load_ir(args.workflow)
        spec = compile_spec(args.nl, ir.domain)
        static = verify_workflow(ir, spec)
        trace = mock_execute(ir, skip_after=args.skip_after or None)
        runtime = monitor_trace(trace, spec)
        from veriflow_runtime.align import align_trace

        print(json.dumps({
            "trace": json.loads(trace.model_dump_json()),
            "runtime": json.loads(runtime.model_dump_json()),
            "alignment": json.loads(align_trace(ir, spec, trace).model_dump_json()),
            "cross": json.loads(cross_verify(static, runtime).model_dump_json()),
        }, indent=2, ensure_ascii=False))
        return
    if args.cmd == "incremental":
        from veriflow_verify.incremental import equivalence_report, incremental_verify

        before = _load_ir(args.before)
        after = _load_ir(args.after)
        spec = compile_spec(args.nl, after.domain)
        previous = verify_workflow(before, spec)
        inc = incremental_verify(before, after, spec, previous=previous)
        full = verify_workflow(after, spec)
        eq = equivalence_report(full, inc.result)
        print(json.dumps({
            "equivalent": eq.equivalent,
            "disagreements": eq.disagreements,
            "impact": inc.impact.model_dump(),
            "used_full_fallback": inc.used_full_fallback,
            "status": inc.result.status,
            "reevaluated_constraints": inc.reevaluated_constraints,
            "total_constraints": inc.total_constraints,
        }, indent=2))
        return


def _load_ir(path: str) -> WorkflowIR:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if payload.get("connections") and not payload.get("ir_version"):
        return get_adapter("n8n").to_ir(payload)
    return get_adapter("compose-json").to_ir(payload)
