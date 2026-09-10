DOMAIN_TOOLS: dict[str, frozenset[str]] = {
    "compose": frozenset({"test_generator", "run_brute", "publish_problem"}),
    "campus": frozenset({"invoice_ocr", "form_fill", "oss_put", "notify_email"}),
}

TERMINAL_TOOLS = frozenset({"publish_problem", "notify_email", "oss_put"})
TERMINAL_KINDS = frozenset({"notify"})

DEFAULT_BINDINGS = frozenset({"spec", "input", "output", "tests"})
