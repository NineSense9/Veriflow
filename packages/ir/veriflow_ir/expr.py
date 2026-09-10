from __future__ import annotations

import ast

_ALLOWED_FUNCS = frozenset({"min", "max", "len", "abs"})
_ALLOWED_BINOPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow)
_ALLOWED_UNARY = (ast.Not, ast.UAdd, ast.USub)
_ALLOWED_CMP = (
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
    ast.In,
    ast.NotIn,
    ast.Is,
    ast.IsNot,
)


class GuardExprError(ValueError):
    pass


def normalize_expr(expr: str) -> str:
    return expr.replace("&&", " and ").replace("||", " or ")


def parse_guard(expr: str) -> ast.Expression:
    if not expr or not expr.strip():
        raise GuardExprError("empty expression")
    normalized = normalize_expr(expr)
    try:
        tree = ast.parse(normalized, mode="eval")
    except SyntaxError as exc:
        raise GuardExprError(f"not an expression: {exc.msg}") from exc
    _assert_not_bare_name(tree)
    _validate(tree)
    return tree


def free_names(expr: str) -> set[str]:
    tree = parse_guard(expr)
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id not in _ALLOWED_FUNCS:
            names.add(node.id)
    return names


def _assert_not_bare_name(tree: ast.AST) -> None:
    if isinstance(tree, ast.Expression) and isinstance(tree.body, ast.Name):
        raise GuardExprError("natural language is not a guard expression")


def _validate(node: ast.AST) -> None:
    if isinstance(node, ast.Expression):
        _validate(node.body)
        return
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float, bool, str)) or node.value is None:
            return
        raise GuardExprError("unsupported constant")
    if isinstance(node, ast.Name):
        return
    if isinstance(node, ast.Attribute):
        if node.attr.startswith("__"):
            raise GuardExprError("dunder attribute is not allowed")
        _validate(node.value)
        return
    if isinstance(node, ast.Subscript):
        _validate(node.value)
        _validate(node.slice)
        return
    if isinstance(node, ast.Slice):
        for part in (node.lower, node.upper, node.step):
            if part is not None:
                _validate(part)
        return
    if isinstance(node, ast.BoolOp) and isinstance(node.op, (ast.And, ast.Or)):
        for value in node.values:
            _validate(value)
        return
    if isinstance(node, ast.BinOp) and isinstance(node.op, _ALLOWED_BINOPS):
        _validate(node.left)
        _validate(node.right)
        return
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, _ALLOWED_UNARY):
        _validate(node.operand)
        return
    if isinstance(node, ast.Compare):
        _validate(node.left)
        if not all(isinstance(op, _ALLOWED_CMP) for op in node.ops):
            raise GuardExprError("unsupported comparison")
        for comparator in node.comparators:
            _validate(comparator)
        return
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in _ALLOWED_FUNCS:
            raise GuardExprError("function call is not allowed")
        if node.keywords:
            raise GuardExprError("keyword arguments are not allowed")
        for arg in node.args:
            _validate(arg)
        return
    if isinstance(node, ast.List | ast.Tuple):
        for elt in node.elts:
            _validate(elt)
        return
    raise GuardExprError(f"unsupported syntax: {type(node).__name__}")
