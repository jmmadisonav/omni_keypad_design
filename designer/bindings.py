"""Sentences that describe a design's bound controls, for Debug and projects.

Design.bindings() lists each bound control. A control bound to an OMNI device
isn't available over HControl; one that uses an AVX script reference is,
at the reference's path.
"""

from __future__ import annotations

_CONTROL_NAMES = {"dial": "dial", "ledring": "LED ring", "dial_button": "dial button"}


def _join(items: list[str]) -> str:
    """["a"] -> "a", ["a", "b"] -> "a and b", ["a", "b", "c"] -> "a, b, and c"."""
    return items[0] if len(items) == 1 else (
        f"{items[0]} and {items[1]}" if len(items) == 2 else f"{', '.join(items[:-1])}, and {items[-1]}")


def control_names(controls: list[str]) -> str:
    """["dial", "button3", "button5"] -> "dial and buttons 3 and 5"."""
    names = [_CONTROL_NAMES[c] for c in controls if c in _CONTROL_NAMES]
    buttons = sorted((c[len("button"):] for c in controls if c not in _CONTROL_NAMES), key=int)
    if buttons:
        names.append(f"button{'s' if len(buttons) > 1 else ''} {_join(buttons)}")
    return _join(names)


def describe_omni_bindings(bindings: list[dict]) -> list[str]:
    """One sentence per page and device, such as "Page 1: dial and button 3 are bound to X."."""
    groups: dict[tuple[int, str], list[str]] = {}
    for binding in bindings:
        if binding["kind"] == "omni":
            groups.setdefault((binding["page"], binding["remote"]), []).append(binding["control"])
    sentences = []
    for (page, remote), controls in groups.items():
        verb, it = ("is", "it isn't") if len(controls) == 1 else ("are", "they aren't")
        sentences.append(f"Page {page}: {control_names(controls)} {verb} bound to "
                         f"{remote or 'an OMNI device'}, so {it} available over HControl.")
    return sentences


def describe_references(bindings: list[dict]) -> list[str]:
    """One sentence per page and script reference, such as
    "Page 1: dial uses the script reference Category_1/Reference_1."."""
    groups: dict[tuple[int, str], list[str]] = {}
    for binding in bindings:
        if binding["kind"] == "reference":
            groups.setdefault((binding["page"], binding["path"]), []).append(binding["control"])
    sentences = []
    for (page, path), controls in groups.items():
        verb = "uses" if len(controls) == 1 else "use"
        sentences.append(f"Page {page}: {control_names(controls)} {verb} the script reference {path}.")
    return sentences
