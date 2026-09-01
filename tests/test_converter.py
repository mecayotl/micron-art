"""Fixture-driven tests for the Python converter.

The fixtures are the source of truth. Never edit an expected file to
make a test pass; see tests/fixtures/README.md.

Run with `python3 -m pytest tests/` or plain `python3 tests/test_converter.py`.
"""

import os
import sys

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "cli"))

from micronart import MODES, convert  # noqa: E402
from micronart.escape import expand_tabs  # noqa: E402
from micronart.palette import micron_color, nibble, xterm256  # noqa: E402


def fixture_names():
    inputs = os.path.join(FIXTURES, "input")
    return sorted(
        name for name in os.listdir(inputs) if name.endswith((".txt", ".ans"))
    )


def read(path):
    with open(path, "r", encoding="utf-8", newline="") as handle:
        return handle.read()


def cases():
    for name in fixture_names():
        stem = name.rsplit(".", 1)[0]
        for mode in MODES:
            yield name, stem, mode


def check_fixture(name, stem, mode):
    raw = read(os.path.join(FIXTURES, "input", name))
    expected = read(os.path.join(FIXTURES, "expected", "%s.%s.mu" % (stem, mode)))
    actual, _ = convert(raw, mode)
    assert actual == expected, "%s.%s: %r != %r" % (stem, mode, actual, expected)


def test_fixtures():
    for name, stem, mode in cases():
        check_fixture(name, stem, mode)


def test_every_fixture_has_both_modes():
    for name in fixture_names():
        stem = name.rsplit(".", 1)[0]
        for mode in MODES:
            path = os.path.join(FIXTURES, "expected", "%s.%s.mu" % (stem, mode))
            assert os.path.exists(path), "missing expected output: %s" % path


def test_tabs_expand_column_aware():
    # A fixed-width substitution would give the same answer for the
    # first case and the wrong one for the rest.
    assert expand_tabs("NAME\tVALUE") == "NAME    VALUE"
    assert expand_tabs("foo\t1") == "foo 1"
    assert expand_tabs("barbaz\t22") == "barbaz  22"
    assert expand_tabs("\t\tdeep") == "        deep"
    assert expand_tabs("a\tb\nc\td") == "a   b\nc   d"


def test_quantization_rounds():
    assert nibble(255) == "f"
    assert nibble(0) == "0"
    # 205 >> 4 is also 12, but 238 truncates to 14 and rounds to 14,
    # while 247 truncates to 15 and rounds to 15; 128 is the case that
    # separates them.
    assert nibble(128) == "8"
    assert nibble(127) == "7"
    assert micron_color((255, 128, 0)) == "f80"


def test_xterm256_cube_and_grays():
    assert xterm256(196) == (255, 0, 0)
    assert xterm256(46) == (0, 255, 0)
    assert xterm256(21) == (0, 0, 255)
    assert xterm256(244) == (128, 128, 128)
    assert xterm256(1) == (0xCD, 0x00, 0x00)


def test_unknown_mode_rejected():
    try:
        convert("x", "color")
    except ValueError:
        return
    raise AssertionError("expected ValueError for an unknown mode")


def state_at_end_of_each_line(markup):
    """Deliberately an independent reader, not the converter's own state
    machine: a test that shared that machinery would pass vacuously.

    The renderer wraps each line in an attribute taken from the state at
    the end of that line and pads the row with it, so a line that ends
    with a background still set paints it to the terminal edge.
    """
    states = []
    fg = bg = None
    bold = italic = underline = False
    for line in markup.split("\n"):
        chars = list(line)
        escape = False
        i = 0
        if chars[:1] == ["\\"]:
            escape = True
            i = 1
        while i < len(chars):
            c = chars[i]
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == "`":
                tag = chars[i + 1] if i + 1 < len(chars) else ""
                i += 1
                if tag == "F":
                    fg = "".join(chars[i + 1:i + 4])
                    i += 3
                elif tag == "B":
                    bg = "".join(chars[i + 1:i + 4])
                    i += 3
                elif tag == "f":
                    fg = None
                elif tag == "b":
                    bg = None
                elif tag == "!":
                    bold = not bold
                elif tag == "*":
                    italic = not italic
                elif tag == "_":
                    underline = not underline
                elif tag == "`":
                    fg = bg = None
                    bold = italic = underline = False
            i += 1
        states.append((fg, bg, bold, italic, underline))
    return states


def test_no_line_leaves_color_open():
    for name in fixture_names():
        markup, _ = convert(read(os.path.join(FIXTURES, "input", name)), "escaped")
        if markup == "":
            continue
        for index, state in enumerate(state_at_end_of_each_line(markup.rstrip("\n"))):
            assert state == (None, None, False, False, False), (
                "%s line %d would paint its background to the terminal edge"
                % (name, index)
            )


def main():
    failures = []
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for name, stem, mode in cases():
        try:
            check_fixture(name, stem, mode)
            print("PASS %s.%s" % (stem, mode))
        except AssertionError as error:
            failures.append(str(error))
            print("FAIL %s.%s" % (stem, mode))
    for test in tests:
        if test is test_fixtures:
            continue
        try:
            test()
            print("PASS %s" % test.__name__)
        except AssertionError as error:
            failures.append("%s: %s" % (test.__name__, error))
            print("FAIL %s" % test.__name__)
    print("\n%d failures" % len(failures))
    for failure in failures:
        print("  " + failure)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
