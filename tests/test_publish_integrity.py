import hashlib
import json

import pytest

from veriflow_api import compose_service as compose


def package_payload():
    return {
        "title": "Echo",
        "statement": "Read one word and print it.",
        "input": "one word",
        "output": "the word",
        "description": "A tiny example.",
        "public_tests": [{"stdin": "hi\n", "stdout": "hi\n"}],
        "hidden_tests": [{"stdin": "bye\n", "stdout": "bye\n"}],
        "reference": {"lang": "python3", "source": "import sys\nprint(sys.stdin.read(), end='')"},
        "limits": {"time_limit_ms": 1000, "memory_limit_mb": 256},
    }


def test_problem_package_requires_both_test_sets_and_bounded_limits():
    assert hasattr(compose, "ProblemPackage")
    with pytest.raises(ValueError):
        compose.ProblemPackage.model_validate({**package_payload(), "hidden_tests": []})
    with pytest.raises(ValueError):
        compose.ProblemPackage.model_validate({**package_payload(), "limits": {"time_limit_ms": 0, "memory_limit_mb": 256}})


def test_package_hash_is_stable():
    assert hasattr(compose, "ProblemPackage")
    package = compose.ProblemPackage.model_validate(package_payload())
    first = package.content_hash()
    second = compose.ProblemPackage.model_validate(package.model_dump()).content_hash()
    assert first == second
    assert len(first) == hashlib.sha256().digest_size * 2


@pytest.fixture
def project(tmp_path, monkeypatch):
    monkeypatch.setenv("VERIFLOW_DB", str(tmp_path / "vf.db"))
    from veriflow_api.db import init_db
    init_db()
    monkeypatch.setenv("VERIFLOW_SANDBOX", "process")
    return compose.create_from_nl(1, "完整出题，带守卫和审题。", allow_ai=False)


def test_no_package_blocks_approval(project):
    with pytest.raises(PermissionError, match="package"):
        compose.set_gate(1, project["id"], "approved")


def test_reference_must_pass_hidden_and_public_cases(project):
    assert hasattr(compose, "save_problem_package")
    bad = package_payload()
    bad["reference"]["source"] = "print('hi')"
    with pytest.raises(PermissionError, match="reference"):
        compose.save_problem_package(1, project["id"], bad)


def test_publish_inserts_tests_is_idempotent_and_private(project):
    assert hasattr(compose, "save_problem_package")
    saved = compose.save_problem_package(1, project["id"], package_payload())
    assert saved["problem_package"]["ready"]
    assert "bye" not in json.dumps(saved)
    assert "import sys" not in json.dumps(compose.list_projects(1))
    compose.set_gate(1, project["id"], "approved")
    first = compose.publish(1, project["id"])
    again = compose.publish(1, project["id"])
    assert first["published_problem_id"] == again["published_problem_id"]
    from veriflow_api.db import connect
    with connect() as connection:
        tests = connection.execute("SELECT * FROM tests WHERE problem_id = ?", (first["published_problem_id"],)).fetchall()
    assert {case["visibility"] for case in tests} == {"hidden", "public"}
    assert len(tests) == 2


def test_package_change_invalidates_approval(project):
    assert hasattr(compose, "save_problem_package")
    compose.save_problem_package(1, project["id"], package_payload())
    compose.set_gate(1, project["id"], "approved")
    changed = package_payload()
    changed["title"] = "new title"
    saved = compose.save_problem_package(1, project["id"], changed)
    assert saved["gate_status"] == "pending"
    with pytest.raises(PermissionError):
        compose.publish(1, project["id"])


def test_guarded_repair_is_restored_without_overwriting_compiler_trace(project):
    draft = compose.create_from_example(1, "missing_gate")
    repaired = compose.guarded_repair(1, draft["id"], allow_ai=False)
    restored = compose.project_payload(compose.get_project(1, draft["id"]))
    assert restored["ai_trace"] == draft["ai_trace"]
    assert restored.get("repair") == repaired["repair"]
    assert restored["repair_history"][0]["report"] == repaired["repair"]
    compose.save_ir(1, draft["id"], compose.WorkflowIR.model_validate(restored["ir"]))
    saved = compose.project_payload(compose.get_project(1, draft["id"]))
    assert saved.get("repair") is None
    assert len(saved["repair_history"]) == 1


def test_concurrent_publish_returns_one_problem(project):
    from concurrent.futures import ThreadPoolExecutor
    from veriflow_api.db import connect
    compose.save_problem_package(1, project["id"], package_payload())
    compose.set_gate(1, project["id"], "approved")
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: compose.publish(1, project["id"]), range(2)))
    assert len({result["published_problem_id"] for result in results}) == 1
    with connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM problems").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM tests").fetchone()[0] == 2


def test_insert_failure_rolls_back_problem_and_project(project):
    import sqlite3
    from veriflow_api.db import connect
    compose.save_problem_package(1, project["id"], package_payload())
    compose.set_gate(1, project["id"], "approved")
    with connect() as connection:
        connection.execute("CREATE TRIGGER fail_test BEFORE INSERT ON tests BEGIN SELECT RAISE(ABORT, 'test failure'); END")
        connection.commit()
    with pytest.raises(sqlite3.IntegrityError):
        compose.publish(1, project["id"])
    with connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM problems").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM tests").fetchone()[0] == 0
    assert compose.get_project(1, project["id"])["published_problem_id"] is None


def test_approval_hash_binds_ir_even_if_gate_flag_survives(project):
    from veriflow_api.db import connect
    compose.save_problem_package(1, project["id"], package_payload())
    compose.set_gate(1, project["id"], "approved")
    altered = dict(project["ir"])
    altered["name"] = "changed after approval"
    with connect() as connection:
        connection.execute("UPDATE compose_projects SET ir_json = ? WHERE id = ?", (json.dumps(altered), project["id"]))
        connection.commit()
    with pytest.raises(PermissionError, match="approval"):
        compose.publish(1, project["id"])


def test_recompile_keeps_repair_history_but_clears_current_association(project):
    draft = compose.create_from_example(1, "missing_gate")
    compose.guarded_repair(1, draft["id"], allow_ai=False)
    recompiled = compose.repair(1, draft["id"], "完整出题，带守卫和审题。", allow_ai=False)
    assert recompiled["repair"] is None
    assert len(recompiled["repair_history"]) == 1
    assert recompiled["compiler_ai_trace"]["stage"] == "nl_ir"


def test_template_requires_explicit_selection_and_discloses_source(project):
    assert project["problem_package"]["ready"] is False
    example = compose.create_from_example(1, "valid_lis")
    assert example["problem_package"]["provenance"]["template_id"] == "VF1012"
    assert example["problem_package"]["provenance"]["kind"] == "explicit_template"


def test_reference_execution_does_not_hold_database_write_lock(project, monkeypatch):
    from veriflow_api.db import connect
    compose.save_problem_package(1, project["id"], package_payload())
    compose.set_gate(1, project["id"], "approved")
    original = compose.validate_reference

    def validate_without_lock(package):
        with connect() as connection:
            connection.execute("PRAGMA busy_timeout=1")
            connection.execute("BEGIN IMMEDIATE")
            connection.rollback()
        return original(package)

    monkeypatch.setattr(compose, "validate_reference", validate_without_lock)
    assert compose.publish(1, project["id"])["published_problem_id"]
