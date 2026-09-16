from veriflow_api.contrast import extract_json


def test_extract_json_from_fence():
    payload = extract_json('```json\n{"source": "print(1)\\n", "guess": "n=1"}\n```')
    assert payload is not None
    assert "print(1)" in payload["source"]
    assert payload["guess"] == "n=1"


def test_extract_json_rejects_empty_source():
    assert extract_json('{"source": "", "guess": "x"}') is None
