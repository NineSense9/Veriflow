from pathlib import Path

BANK = Path(__file__).resolve().parents[1] / "examples" / "problems"


def _fence(text: str) -> str:
    text = text.replace("\r\n", "\n")
    if text.endswith("\n"):
        text = text[:-1]
    return f"```\n{text}\n```"


def test_bank_ids_are_vf1001_to_vf1030():
    packs = sorted(path.name for path in BANK.iterdir() if (path / "spec.json").is_file())
    assert packs == [f"VF{index}" for index in range(1001, 1031)]


def test_every_pack_has_io_and_public_samples_in_statement():
    errors: list[str] = []
    for pack in sorted(path for path in BANK.iterdir() if (path / "spec.json").is_file()):
        statement_path = pack / "statement.md"
        if not statement_path.is_file():
            errors.append(f"{pack.name}: missing statement.md")
            continue
        statement = statement_path.read_text(encoding="utf-8")
        for heading in ("## 输入", "## 输出", "## 样例"):
            if heading not in statement:
                errors.append(f"{pack.name}: missing {heading}")
        public = pack / "tests" / "public"
        ins = sorted(public.glob("*.in")) if public.is_dir() else []
        if not ins:
            errors.append(f"{pack.name}: no public tests")
        for stdin_path in ins:
            stdout_path = stdin_path.with_suffix(".out")
            if not stdout_path.is_file():
                errors.append(f"{pack.name}: {stdin_path.name} has no .out")
                continue
            stdin = stdin_path.read_text(encoding="utf-8")
            stdout = stdout_path.read_text(encoding="utf-8")
            if _fence(stdin) not in statement:
                errors.append(f"{pack.name}: public {stdin_path.stem} stdin not in statement")
            if _fence(stdout) not in statement:
                errors.append(f"{pack.name}: public {stdin_path.stem} stdout not in statement")
        hidden = pack / "tests" / "hidden"
        hidden_ins = list(hidden.glob("*.in")) if hidden.is_dir() else []
        if not hidden_ins:
            errors.append(f"{pack.name}: no hidden tests")
    assert not errors, "\n".join(errors)


def test_seeded_api_exposes_io_and_public_tests(api_client):
    listing = api_client.get("/api/problems")
    assert listing.status_code == 200, listing.text
    problems = listing.json()["problems"]
    ids = [item["id"] for item in problems]
    assert ids == [f"VF{index}" for index in range(1001, 1031)]
    errors: list[str] = []
    for problem_id in ids:
        response = api_client.get(f"/api/problems/{problem_id}")
        assert response.status_code == 200, response.text
        body = response.json()
        statement = body["statement"]
        for heading in ("## 输入", "## 输出", "## 样例"):
            if heading not in statement:
                errors.append(f"{problem_id}: API statement missing {heading}")
        tests = body["public_tests"]
        if not tests:
            errors.append(f"{problem_id}: API public_tests empty")
            continue
        for item in tests:
            if _fence(item["stdin"]) not in statement:
                errors.append(f"{problem_id}: API sample {item['name']} stdin missing from statement")
            if _fence(item["stdout"]) not in statement:
                errors.append(f"{problem_id}: API sample {item['name']} stdout missing from statement")
    assert not errors, "\n".join(errors)
