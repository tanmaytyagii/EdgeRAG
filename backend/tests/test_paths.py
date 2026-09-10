import pytest

from edgerag.core.errors import ValidationError
from edgerag.core.paths import resolve_within, sanitize_filename


@pytest.mark.parametrize(
    "raw,expected_suffix",
    [("report.pdf", ".pdf"), ("../../etc/passwd", ""), ("C:\\Windows\\evil.md", ".md"), ("a b c.txt", ".txt")],
)
def test_sanitize_strips_directories(raw, expected_suffix):
    cleaned = sanitize_filename(raw)
    assert "/" not in cleaned and "\\" not in cleaned and ".." not in cleaned
    assert cleaned.endswith(expected_suffix)


def test_resolve_within_blocks_traversal(tmp_path):
    with pytest.raises(ValidationError):
        resolve_within(tmp_path, "..", "..", "etc", "passwd")


def test_resolve_within_allows_children(tmp_path):
    assert resolve_within(tmp_path, "kb", "file.pdf").is_relative_to(tmp_path)
