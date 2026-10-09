"""The keypad models the designer supports.

Each model is a file in designer/models/: its name, button grid, whether it
has a dial and LED ring, faceplate shape, whether it's been tested on real
hardware, the size of its button images, and a one-page keypad.json that new
projects start from.

A model file can also list aliases: other model ids a keypad reports for
the same hardware. The tabletop OMNI-KP-T8BV is an OMNI-KP-8BV in another
housing, so an 8BV project loads from and deploys to either. The tabletop
field gives the tabletop housing's button grid, which can differ: the T6B and
T6BV turn the screen sideways, so their 6 buttons are 3 columns by 2 rows.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parent / "models"
DEFAULT_MODEL = "OMNI-KP-8BV"            # Projects made before models existed.

_DIAL_KEYS = ("ledring", "dial", "dial_button")
_FACEPLATES = ("square", "portrait")


@dataclass(frozen=True)
class Model:
    id: str
    name: str
    columns: int
    rows: int
    dial: bool
    faceplate: str
    tested: bool
    image_size: int          # Button images are image_size x image_size pixels.
    template: dict
    aliases: tuple[str, ...] = ()   # Other ids for the same hardware, such as OMNI-KP-T8BV.
    tabletop: dict | None = None    # {"columns", "rows"} in the tabletop housing.

    @property
    def buttons(self) -> int:
        return self.columns * self.rows

    def summary(self) -> dict:
        return {k: list(v) if k == "aliases" else v for k, v in asdict(self).items() if k != "template"}


def load_models(folder: str | Path = MODELS_DIR) -> dict[str, Model]:
    """Load and check every model file, ordered by button count, then dial."""
    models = [_load(path) for path in sorted(Path(folder).glob("*.json"))]
    owner = {m.id: m.id for m in models}          # Each id and alias -> its model file.
    for model in models:
        for alias in model.aliases:
            if alias in owner:
                raise ValueError(f"the model files {owner[alias]}.json and {model.id}.json "
                                 f"both claim {alias}")
            owner[alias] = model.id
    return {m.id: m for m in sorted(models, key=lambda m: (m.buttons, m.dial))}


def model_for(models: dict[str, Model], reported: str) -> str | None:
    """Return the id of the model a keypad that reports `reported` is, or None.

    A tabletop keypad reports its own id, such as OMNI-KP-T8BV, and is the
    model that lists it as an alias.
    """
    if reported in models:
        return reported
    return next((m.id for m in models.values() if reported in m.aliases), None)


def _load(path: Path) -> Model:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        fields = {field: data[field] for field in Model.__dataclass_fields__
                  if field not in ("aliases", "tabletop")}
        aliases = data.get("aliases", [])
        if not isinstance(aliases, list) or not all(isinstance(a, str) and a for a in aliases):
            raise ValueError("aliases must be a list of model ids")
        tabletop = data.get("tabletop", {"columns": fields["columns"], "rows": fields["rows"]})
        model = Model(**fields, aliases=tuple(aliases), tabletop=tabletop)
        _check(model, path)
        return model
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f"the model file {path.name} isn't valid: {error}") from None


def _check(model: Model, path: Path) -> None:
    if model.id != path.stem:
        raise ValueError(f"its id is {model.id!r}, but the file is named {path.name}")
    if not (isinstance(model.columns, int) and isinstance(model.rows, int)
            and model.columns > 0 and model.rows > 0):
        raise ValueError("columns and rows must be whole numbers")
    grid = model.tabletop
    if not (isinstance(grid, dict) and set(grid) == {"columns", "rows"}
            and all(type(grid[k]) is int and grid[k] > 0 for k in grid)):
        raise ValueError("tabletop must be {\"columns\": n, \"rows\": n}")
    if grid["columns"] * grid["rows"] != model.buttons:
        raise ValueError(f"the tabletop grid is {grid['columns']} x {grid['rows']}, "
                         f"but the model has {model.buttons} buttons")
    if type(model.image_size) is not int or model.image_size <= 0:
        raise ValueError("image_size must be a whole number of pixels")
    if model.faceplate not in _FACEPLATES:
        raise ValueError(f"faceplate must be one of {', '.join(_FACEPLATES)}")
    pages = model.template.get("pages")
    if not isinstance(pages, list) or len(pages) != 1:
        raise ValueError("the template must have exactly one page")
    page = pages[0]
    if len(page.get("buttons", [])) != model.buttons:
        raise ValueError(f"the template has {len(page.get('buttons', []))} buttons, "
                         f"but {model.columns} x {model.rows} is {model.buttons}")
    present = [key in page for key in _DIAL_KEYS]
    if any(present) != model.dial or all(present) != model.dial:
        raise ValueError(f"dial is {str(model.dial).lower()}, but the template's page "
                         f"{'lacks' if model.dial else 'has'} dial settings")
