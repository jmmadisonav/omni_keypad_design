"""Keep keypad designs as named projects you can edit without a keypad.

A project is a folder in designer/projects/ with the same layout as the
repo's design/ folder (keypad.json and images/), plus designer.json for the
designer's own data: the keypad model, each button's layers, and the fingerprint of the keypad design the project last loaded from or deployed to.
"""

from __future__ import annotations

import base64
import copy
import datetime
import json
import re
import secrets
import shutil
import threading
from pathlib import Path

from designer.bindings import describe_omni_bindings, describe_references
from designer.keypad_ops import ButtonImages, Layout, apply_buttons, apply_layout
from designer.library import valid_recipe, validate_name
from designer.models import DEFAULT_MODEL, Model, load_models
from keypad_design import Design

_META = "designer.json"
_RECIPE_KEY = re.compile(r"([1-9]\d*)-([1-9]\d*)")
_COLOUR = re.compile(r"#[0-9A-Fa-f]{6}")
HOUSINGS = ("wall", "tabletop")        # How the keypad view draws the project.
FINISHES = ("black", "white")             # Tabletop keypads only come in black.


def project_name_for(host: str, today: datetime.date | None = None) -> str:
    """Name a project loaded from a keypad, such as "172-17-0-55 2026-10-06"."""
    today = today or datetime.date.today()
    return f"{re.sub(r'[^A-Za-z0-9_-]', '-', host)[:50]} {today.isoformat()}"


class ProjectStore:
    def __init__(self, folder: str | Path, models: dict[str, Model] | None = None):
        self.folder = Path(folder)
        self.folder.mkdir(parents=True, exist_ok=True)
        self.models = models if models is not None else load_models()
        self._lock = threading.RLock()            # One write at a time.

    def list(self) -> list[dict]:
        found = []
        for path in self.folder.iterdir():
            config = path / "keypad.json"
            if not path.is_dir() or not config.exists():
                continue
            try:
                validate_name(path.name)
            except ValueError:
                continue                         # Temporary or hand-made folders.
            found.append((config.stat().st_mtime, path.name))
        return [{"name": name, "model": self._meta(name)["model"],
                 "saved": datetime.datetime.fromtimestamp(mtime).isoformat(timespec="seconds")}
                for mtime, name in sorted(found, reverse=True)]

    def unique_name(self, base: str) -> str:
        name, number = base, 2
        while self._path(name).exists():
            name = f"{base} {number}"
            number += 1
        return name

    def new(self, name: str, model: str = DEFAULT_MODEL, unique: bool = False,
            housing: str = "wall", finish: str = "black") -> dict:
        """Create a project for a keypad model. With unique, pick a free name."""
        if model not in self.models:
            raise ValueError(f"{model!r} isn't a keypad model the designer supports")
        view = _finish(_check_settings({"housing": self._housing(model, housing), "finish": finish}))
        with self._lock:
            return self._new(self.unique_name(name) if unique else name, model, view)

    def _new(self, name: str, model: str, view: dict) -> dict:
        self._new_path(name)
        config = copy.deepcopy(self.models[model].template)
        config["fingerprint"] = ""
        config["lastdeployedtimestamp"] = ""
        self._write(name, Design(config), {**_empty_meta("", model), **view})
        return self.open(name)

    def open(self, name: str) -> dict:
        design = self.design(name)
        meta = self._meta(name)
        used = design.referenced_images()
        bindings = design.bindings()
        return {
            "name": name,
            "config": design.config,
            "images": {image: base64.b64encode(body).decode("ascii")
                       for image, body in design.images.items() if image in used},
            # Recipes from an older designer are dropped: those buttons show their keypad images.
            "recipes": {key: r for key, r in meta["recipes"].items() if valid_recipe(r)},
            "bindings": bindings,
            "bindingWarnings": describe_omni_bindings(bindings),
            "referenceNotes": describe_references(bindings),
            "baseFingerprint": meta["baseFingerprint"],
            "model": meta["model"],
            "lastDeployed": meta["lastDeployed"],
            "showAlt": meta["showAlt"],
            "housing": meta["housing"],
            "finish": _finish(meta)["finish"],
        }

    def design(self, name: str) -> Design:
        path = self._path(name)
        if not (path / "keypad.json").exists():
            raise FileNotFoundError(f"there's no project called {name!r}")
        return Design.load(path)

    def base_fingerprint(self, name: str) -> str:
        self.design(name)                         # FileNotFoundError if missing.
        return self._meta(name)["baseFingerprint"]

    def model_of(self, name: str) -> str:
        self.design(name)                         # FileNotFoundError if missing.
        return self._meta(name)["model"]

    def save(self, name: str, buttons: list[ButtonImages], layout: Layout | None,
             recipes: dict, separator: str | None = None,
             remove_omni_bindings: bool = False, remove_script_references: bool = False) -> dict:
        """Save changes. separator, when given, is the #RRGGBB colour of the
        lines between buttons on the keypad. remove_omni_bindings unbinds every
        control bound to an OMNI device, and remove_script_references takes
        every control off its script reference, on every page."""
        if separator is not None and not _COLOUR.fullmatch(separator):
            raise ValueError(f"the separator colour must be #RRGGBB, not {separator!r}")
        with self._lock:
            return self._save(name, buttons, layout, recipes, separator, remove_omni_bindings,
                              remove_script_references)

    def _save(self, name: str, buttons: list[ButtonImages], layout: Layout | None,
              recipes: dict, separator: str | None, remove_omni_bindings: bool,
              remove_script_references: bool) -> dict:
        design = self.design(name)
        meta = self._meta(name)
        if separator is not None:
            design.config.setdefault("display", {})["panel_separator_color"] = separator.upper()
        if layout is not None:
            apply_layout(design, layout)          # Image page numbers use the new layout.
        if remove_omni_bindings:
            design.remove_omni_bindings()         # After the layout, so new pages are covered.
        if remove_script_references:
            design.remove_script_references()
        try:
            apply_buttons(design, buttons)
        except IndexError as error:
            raise ValueError(str(error)) from None
        design.prune_images()
        meta["recipes"] = _clean_recipes(recipes, design)
        self._write(name, design, meta)
        return self.open(name)

    def copy(self, name: str, to: str) -> dict:
        with self._lock:
            design = self.design(name)
            meta = self._meta(name)
            self._new_path(to)
            self._write(to, design, meta)
            return self.open(to)

    def rename(self, name: str, to: str) -> dict:
        """Rename a project, and return it opened under its new name.

        A change of case alone, such as lobby to Lobby, is allowed. Any other
        name a project already has, in any case, is refused.
        """
        with self._lock:
            old = self._path(name)
            if not (old / "keypad.json").exists():
                raise FileNotFoundError(f"there's no project called {name!r}")
            new = self._path(to)
            if to.lower() != name.lower() and any(
                    path.name.lower() == to.lower() for path in self.folder.iterdir()):
                raise FileExistsError(f"there's already a project called {to!r}")
            # Through a temporary name, so a change of case works where names ignore it.
            temp = old.with_name(f".renaming-{secrets.token_hex(4)}")
            old.rename(temp)
            temp.rename(new)
            return self.open(to)

    def import_design(self, name: str, data: bytes, base_fingerprint: str,
                      model: str = DEFAULT_MODEL, housing: str = "wall") -> dict:
        view = _check_settings({"housing": self._housing(model, housing)})
        with self._lock:
            self._new_path(name)
            design = Design.from_cpio(data)
            design.prune_images()
            self._write(name, design, {**_empty_meta(base_fingerprint, model), **view})
            return self.open(name)

    def _housing(self, model: str, housing: str) -> str:
        """A model with no tabletop housing, such as the OMNI-KP-V, is always a wall unit."""
        known = self.models.get(model)
        return "wall" if known and known.tabletop is None else housing

    def set_show_alt(self, name: str, show: bool) -> dict:
        """Show or hide the ALT state while editing this project."""
        return self.set_settings(name, {"showAlt": bool(show)})

    def set_settings(self, name: str, changes: dict) -> dict:
        """Change how the designer shows this project: showAlt, housing, finish.

        These are saved at once and aren't part of the keypad design.
        """
        changes = _check_settings(changes)
        if not changes:
            raise ValueError("send at least one of showAlt, housing, or finish")
        with self._lock:
            meta = self._meta(name)
            if "housing" in changes:
                changes["housing"] = self._housing(meta["model"], changes["housing"])
            meta = _finish({**meta, **changes})
            (self._path(name) / _META).write_text(json.dumps(meta, indent=2) + "\n",
                                                  encoding="utf-8")
            return self.open(name)

    def set_base(self, name: str, fingerprint: str, deployed: str | None = None) -> None:
        """Record the keypad design the project matches, and when it was deployed if it was."""
        with self._lock:
            meta = self._meta(name)
            meta["baseFingerprint"] = fingerprint
            if deployed is not None:
                meta["lastDeployed"] = deployed
            (self._path(name) / _META).write_text(json.dumps(meta, indent=2) + "\n",
                                                  encoding="utf-8")

    # -- Helpers -----------------------------------------------------------------

    def _path(self, name: str) -> Path:
        return self.folder / validate_name(name)

    def _new_path(self, name: str) -> Path:
        path = self._path(name)
        if path.exists():
            raise FileExistsError(f"there's already a project called {name!r}")
        return path

    def _meta(self, name: str) -> dict:
        path = self._path(name) / _META
        if not path.exists():
            return _empty_meta("")
        meta = json.loads(path.read_text(encoding="utf-8"))
        return {**_empty_meta(""), **meta}

    def _write(self, name: str, design: Design, meta: dict) -> None:
        """Write the project to a temporary folder, then swap it in."""
        target = self._path(name)
        temp = self.folder / f".{secrets.token_hex(4)}.tmp"
        old = None
        swapped = False
        try:
            design.save(temp)
            (temp / _META).write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
            if target.exists():
                old = self.folder / f".{secrets.token_hex(4)}.old"
                target.rename(old)
            try:
                temp.rename(target)
                swapped = True
            except OSError as error:
                if old is not None:
                    try:
                        old.rename(target)        # Put the previous version back.
                        old = None
                    except OSError:
                        raise OSError(f"couldn't save {name}, or put the previous version back. "
                                      f"The previous version is in {old}: {error}") from error
                raise
        finally:
            shutil.rmtree(temp, ignore_errors=True)
            if old is not None and swapped:       # Only once the new version is in place.
                shutil.rmtree(old, ignore_errors=True)


def _empty_meta(base_fingerprint: str, model: str = DEFAULT_MODEL) -> dict:
    return {"version": 1, "model": model, "baseFingerprint": base_fingerprint, "recipes": {},
            "lastDeployed": "", "showAlt": False, "housing": "wall", "finish": "black"}


def _finish(view: dict) -> dict:
    """Return view with a black finish when it's a tabletop: there's no white tabletop keypad."""
    return {**view, "finish": "black"} if view.get("housing") == "tabletop" else view


def _check_settings(changes: dict) -> dict:
    """Return the view settings in changes, or raise ValueError for a bad one."""
    allowed = {"showAlt": (True, False), "housing": HOUSINGS, "finish": FINISHES}
    for key, value in changes.items():
        if key not in allowed:
            raise ValueError(f"{key!r} isn't a project setting")
        if key == "showAlt" and not isinstance(value, bool):
            raise ValueError("showAlt must be true or false")
        if value not in allowed[key]:
            raise ValueError(f"{key} must be one of {', '.join(map(str, allowed[key]))}")
    return dict(changes)


def _clean_recipes(recipes: dict, design: Design) -> dict:
    """Check recipes keyed "<page>-<button>" against the saved design."""
    if not isinstance(recipes, dict):
        raise ValueError("recipes must be an object keyed \"<page>-<button>\"")
    clean = {}
    for key, recipe in recipes.items():
        match = _RECIPE_KEY.fullmatch(key) if isinstance(key, str) else None
        if not match:
            raise ValueError(f"{key!r} isn't a \"<page>-<button>\" key")
        page, button = int(match[1]), int(match[2])
        if page > len(design.pages) or button > len(design.page(page)["buttons"]):
            raise ValueError(f"page {page} button {button} doesn't exist")
        if not valid_recipe(recipe):
            raise ValueError(f"the layers for page {page} button {button} aren't a valid recipe")
        clean[key] = recipe
    return clean
