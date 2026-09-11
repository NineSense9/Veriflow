import pytest

from veriflow_sandbox import factory as sandbox_factory
from veriflow_sandbox.factory import SandboxUnavailable, get_sandbox


def test_docker_requested_unavailable_is_fail_closed(monkeypatch):
    monkeypatch.setenv("VERIFLOW_SANDBOX", "docker")
    monkeypatch.setattr(sandbox_factory, "docker_available", lambda: False)
    sandbox_factory._docker_cache = None
    with pytest.raises(SandboxUnavailable):
        get_sandbox()


def test_process_mode_still_works(monkeypatch):
    monkeypatch.setenv("VERIFLOW_SANDBOX", "process")
    sandbox_factory._docker_cache = None
    box = get_sandbox()
    assert box.name == "process"
