"""Save button recipes so you can reopen and reuse them.

A recipe is the layers that make up a button: a list of layers for each
state (off, on, and optionally alt), with "version": 2. It's saved as
<name>.json, with the rendered OFF image as <name>.png
for the thumbnail.
"""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path

from keypad_design import png_size

_NAME = re.compile(r"[A-Za-z0-9_-](?:[A-Za-z0-9 _-]{0,62}[A-Za-z0-9_-])?")
_RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{n}" for n in range(1, 10)),
             *(f"LPT{n}" for n in range(1, 10))}     # Reserved file names on Windows.


def validate_name(name: str) -> str:
    """Return name if it's safe to use as a file name, or raise ValueError."""
    if not isinstance(name, str) or not _NAME.fullmatch(name) or name.upper() in _RESERVED:
        raise ValueError(f"{name!r} isn't a valid name. Use 1 to 64 letters, digits, "
                         "spaces, dashes, or underscores, with no space at either end.")
    return name


def valid_recipe(recipe: object) -> bool:
    """Return whether recipe is a version 2 button recipe."""
    if not isinstance(recipe, dict):
        return False
    states = recipe.get("states")
    if recipe.get("version") != 2 or not isinstance(states, dict) \
            or not {"off", "on"} <= states.keys() <= {"off", "on", "alt"}:
        return False
    return all(isinstance(s, dict) and isinstance(s.get("layers"), list) for s in states.values())


class Library:
    def __init__(self, folder: str | Path):
        self.folder = Path(folder)
        self.folder.mkdir(parents=True, exist_ok=True)

    def list(self) -> list[dict]:
        items = []
        for path in sorted(self.folder.glob("*.json"), key=lambda p: p.stem.lower()):
            thumbnail = path.with_suffix(".png")
            items.append({"name": path.stem, "thumbnail": (
                "data:image/png;base64," + base64.b64encode(thumbnail.read_bytes()).decode("ascii")
                if thumbnail.exists() else "")})
        return items

    def get(self, name: str) -> dict:
        path = self._path(name, ".json")
        if not path.exists():
            raise FileNotFoundError(f"there's no recipe called {name!r}")
        recipe = json.loads(path.read_text(encoding="utf-8"))
        if not valid_recipe(recipe):
            raise ValueError(f"{name!r} was made by an older version of the designer, "
                             "which this version can't open. Delete it and make it again.")
        return recipe

    def save(self, name: str, recipe: dict, thumbnail: bytes) -> dict:
        path = self._path(name, ".json")
        if not valid_recipe(recipe):
            raise ValueError("a recipe needs \"version\": 2 with OFF and ON states")
        png_size(thumbnail)                   # Raises ValueError if it isn't a PNG.
        recipe = {**recipe, "name": name}
        path.write_text(json.dumps(recipe, indent=2) + "\n", encoding="utf-8")
        path.with_suffix(".png").write_bytes(thumbnail)
        return recipe

    def delete(self, name: str) -> None:
        path = self._path(name, ".json")
        if not path.exists():
            raise FileNotFoundError(f"there's no recipe called {name!r}")
        path.unlink()
        path.with_suffix(".png").unlink(missing_ok=True)

    def _path(self, name: str, suffix: str) -> Path:
        return self.folder / (validate_name(name) + suffix)
