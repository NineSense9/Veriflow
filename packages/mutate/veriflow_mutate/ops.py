from __future__ import annotations

import ast
import copy

COMPARE_FLIP: dict[type, type] = {
    ast.Gt: ast.GtE,
    ast.GtE: ast.Gt,
    ast.Lt: ast.LtE,
    ast.LtE: ast.Lt,
    ast.Eq: ast.NotEq,
    ast.NotEq: ast.Eq,
}


def mutate_source(source: str) -> list[tuple[str, str]]:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []
    mutants: list[tuple[str, str]] = []
    mutants.extend(_compare_mutants(tree, source))
    mutants.extend(_range_mutants(tree))
    mutants.extend(_augassign_mutants(tree))
    mutants.extend(_empty_if_mutants(tree))
    mutants.extend(_early_return_mutants(tree))
    unique: list[tuple[str, str]] = []
    seen: set[str] = set()
    for name, text in mutants:
        if text == source or text in seen:
            continue
        seen.add(text)
        unique.append((name, text))
    return unique


def _dump(tree: ast.AST) -> str:
    ast.fix_missing_locations(tree)
    return ast.unparse(tree) + "\n"


def _compare_mutants(tree: ast.AST, source: str) -> list[tuple[str, str]]:
    count = 0
    for node in ast.walk(tree):
        if isinstance(node, ast.Compare) and node.ops:
            count += 1
    out: list[tuple[str, str]] = []
    for index in range(count):
        clone = copy.deepcopy(tree)

        class Flip(ast.NodeTransformer):
            def __init__(self) -> None:
                self.seen = 0

            def visit_Compare(self, node: ast.Compare) -> ast.AST:
                self.generic_visit(node)
                if self.seen == index:
                    op = node.ops[0]
                    flipped = COMPARE_FLIP.get(type(op))
                    if flipped:
                        node = copy.copy(node)
                        node.ops = [flipped(), *node.ops[1:]]
                self.seen += 1
                return node

        flipped = Flip().visit(clone)
        text = _dump(flipped)
        if text != source:
            out.append((f"compare_{index}", text))
    return out


def _range_mutants(tree: ast.AST) -> list[tuple[str, str]]:
    count = 0
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "range"
            and node.args
        ):
            count += 1
    out: list[tuple[str, str]] = []
    for index in range(count):
        for delta, tag in ((-1, "minus"), (1, "plus")):
            clone = copy.deepcopy(tree)

            class Shift(ast.NodeTransformer):
                def __init__(self) -> None:
                    self.seen = 0

                def visit_Call(self, node: ast.Call) -> ast.AST:
                    self.generic_visit(node)
                    is_range = (
                        isinstance(node.func, ast.Name)
                        and node.func.id == "range"
                        and bool(node.args)
                    )
                    if is_range and self.seen == index:
                        arg0 = node.args[0]
                        node = copy.copy(node)
                        node.args = list(node.args)
                        node.args[0] = ast.BinOp(
                            left=arg0,
                            op=ast.Add() if delta > 0 else ast.Sub(),
                            right=ast.Constant(1),
                        )
                    if is_range:
                        self.seen += 1
                    return node

            out.append((f"range_{index}_{tag}", _dump(Shift().visit(clone))))
    return out


def _augassign_mutants(tree: ast.AST) -> list[tuple[str, str]]:
    count = 0
    for node in ast.walk(tree):
        if isinstance(node, ast.AugAssign) and isinstance(node.op, (ast.Add, ast.Sub)):
            count += 1
    out: list[tuple[str, str]] = []
    for index in range(count):
        clone = copy.deepcopy(tree)

        class FlipAug(ast.NodeTransformer):
            def __init__(self) -> None:
                self.seen = 0

            def visit_AugAssign(self, node: ast.AugAssign) -> ast.AST:
                self.generic_visit(node)
                if self.seen == index and isinstance(node.op, (ast.Add, ast.Sub)):
                    node = copy.copy(node)
                    node.op = ast.Sub() if isinstance(node.op, ast.Add) else ast.Add()
                if isinstance(node.op, (ast.Add, ast.Sub)):
                    self.seen += 1
                return node

        out.append((f"aug_{index}", _dump(FlipAug().visit(clone))))
    return out


def _empty_if_mutants(tree: ast.AST) -> list[tuple[str, str]]:
    clone = copy.deepcopy(tree)

    class DropEmpty(ast.NodeTransformer):
        def visit_If(self, node: ast.If) -> ast.AST:
            self.generic_visit(node)
            test = node.test
            drop = False
            if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
                drop = True
            if (
                isinstance(test, ast.Compare)
                and test.ops
                and isinstance(test.ops[0], ast.Eq)
                and test.comparators
                and isinstance(test.comparators[0], ast.Constant)
                and test.comparators[0].value == 0
            ):
                drop = True
            if drop:
                return ast.Pass()
            return node

    text = _dump(DropEmpty().visit(clone))
    return [("drop_empty_if", text)] if text != ast.unparse(tree) + "\n" else []


def _early_return_mutants(tree: ast.AST) -> list[tuple[str, str]]:
    count = 0
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.body:
            count += 1
    out: list[tuple[str, str]] = []
    for index in range(count):
        clone = copy.deepcopy(tree)

        class Early(ast.NodeTransformer):
            def __init__(self) -> None:
                self.seen = 0

            def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.AST:
                self.generic_visit(node)
                if self.seen == index and node.body:
                    node = copy.copy(node)
                    node.body = [ast.Return(value=None), *node.body]
                if node.body:
                    self.seen += 1
                return node

        out.append((f"early_return_{index}", _dump(Early().visit(clone))))
    return out
