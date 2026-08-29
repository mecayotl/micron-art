"""Command line entry point: micronart [-m MODE] [FILE]"""

import argparse
import sys

from .converter import ESCAPED, LITERAL, MODES, convert


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="micronart",
        description="Convert ASCII/ANSI art into NomadNet Micron markup.",
    )
    parser.add_argument(
        "file",
        nargs="?",
        help="art to convert; reads standard input when omitted",
    )
    parser.add_argument(
        "-m",
        "--mode",
        choices=MODES,
        default=LITERAL,
        help="%s wraps the art verbatim and is monochrome; %s escapes in "
        "place so colour can be applied (default: %%(default)s)" % (LITERAL, ESCAPED),
    )
    args = parser.parse_args(argv)

    if args.file:
        # newline="" keeps carriage returns intact so the converter, not
        # the reader, decides how they are handled.
        with open(args.file, "r", encoding="utf-8", newline="") as handle:
            raw = handle.read()
    else:
        raw = sys.stdin.read()

    markup, warnings = convert(raw, args.mode)
    for warning in dict.fromkeys(warnings):
        print("warning: %s" % warning, file=sys.stderr)
    sys.stdout.write(markup)
    return 0


if __name__ == "__main__":
    sys.exit(main())
