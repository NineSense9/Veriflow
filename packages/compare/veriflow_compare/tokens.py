def tokenize(text: str) -> list[str]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []
    return normalized.split()


def outputs_equal(actual: str, expected: str) -> bool:
    return tokenize(actual) == tokenize(expected)
