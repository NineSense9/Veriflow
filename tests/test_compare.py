from veriflow_compare.tokens import outputs_equal, tokenize


def test_ignore_trailing_whitespace_and_blank_lines():
    assert outputs_equal("6\n", "6")
    assert outputs_equal("6 \n\n", "6")
    assert outputs_equal("1 2\n", "1\n2\n")


def test_crlf():
    assert outputs_equal("6\r\n", "6\n")


def test_not_equal():
    assert not outputs_equal("6", "3")
    assert tokenize("1 2 3") == ["1", "2", "3"]
