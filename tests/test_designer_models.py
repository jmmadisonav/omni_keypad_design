import json
import shutil
import tempfile
import unittest
from pathlib import Path

from designer.models import DEFAULT_MODEL, MODELS_DIR, load_models, model_for

DIAL_KEYS = ("ledring", "dial", "dial_button")


class ShippedModelTests(unittest.TestCase):
    def setUp(self):
        self.models = load_models()

    def test_models_in_order(self):
        # Keypads with buttons come first, by size; the knob-only KP-V comes last.
        self.assertEqual(list(self.models), ["OMNI-KP-6B", "OMNI-KP-6BV", "OMNI-KP-8BV", "OMNI-KP-V"])
        self.assertEqual(DEFAULT_MODEL, "OMNI-KP-8BV")

    def test_buttons_dial_faceplate_and_tested(self):
        expected = {"OMNI-KP-6B": ("6B", 2, 3, False, "portrait", False),
                    "OMNI-KP-6BV": ("6BV", 2, 3, True, "portrait", False),
                    "OMNI-KP-8BV": ("8BV", 4, 2, True, "square", True),
                    "OMNI-KP-V": ("V", 0, 0, True, "knob", True)}
        for model_id, (name, columns, rows, dial, faceplate, tested) in expected.items():
            model = self.models[model_id]
            with self.subTest(model=model_id):
                self.assertEqual((model.name, model.columns, model.rows, model.dial,
                                  model.faceplate, model.tested),
                                 (name, columns, rows, dial, faceplate, tested))
                page = model.template["pages"][0]
                self.assertEqual(len(model.template["pages"]), 1)
                self.assertEqual(len(page["buttons"]), model.buttons)
                self.assertEqual(all(key in page for key in DIAL_KEYS), dial)
                self.assertEqual(any(key in page for key in DIAL_KEYS), dial)
                for button in page["buttons"]:
                    self.assertEqual((button["offImage"], button["onImage"], button["destination"]),
                                     ([], [], ""))

    def test_image_sizes(self):
        # The 6B and 6BV show 150x150 button images; the 8BV shows 188x188.
        self.assertEqual({m: self.models[m].image_size for m in self.models},
                         {"OMNI-KP-6B": 150, "OMNI-KP-6BV": 150, "OMNI-KP-8BV": 188,
                          "OMNI-KP-V": 150})
        self.assertEqual(self.models["OMNI-KP-6B"].summary()["image_size"], 150)

    def test_tabletop_models_are_aliases(self):
        self.assertEqual({m: list(self.models[m].aliases) for m in self.models},
                         {"OMNI-KP-6B": ["OMNI-KP-T6B"], "OMNI-KP-6BV": ["OMNI-KP-T6BV"],
                          "OMNI-KP-8BV": ["OMNI-KP-T8BV"], "OMNI-KP-V": []})
        self.assertEqual(self.models["OMNI-KP-8BV"].summary()["aliases"], ["OMNI-KP-T8BV"])

    def test_model_for_what_a_keypad_reports(self):
        self.assertEqual(model_for(self.models, "OMNI-KP-8BV"), "OMNI-KP-8BV")
        self.assertEqual(model_for(self.models, "OMNI-KP-T8BV"), "OMNI-KP-8BV")
        self.assertEqual(model_for(self.models, "OMNI-KP-T6B"), "OMNI-KP-6B")
        self.assertEqual(model_for(self.models, "OMNI-KP-V"), "OMNI-KP-V")
        self.assertIsNone(model_for(self.models, "OMNI-KP-9X"))

    def test_tabletop_grids(self):
        # The tabletop T6B and T6BV turn the screen sideways: 3 columns x 2 rows.
        self.assertEqual({m: self.models[m].tabletop for m in self.models},
                         {"OMNI-KP-6B": {"columns": 3, "rows": 2},
                          "OMNI-KP-6BV": {"columns": 3, "rows": 2},
                          "OMNI-KP-8BV": {"columns": 4, "rows": 2},
                          "OMNI-KP-V": None})
        self.assertEqual(self.models["OMNI-KP-6B"].summary()["tabletop"], {"columns": 3, "rows": 2})

    def test_new_projects_have_black_separators(self):
        for model_id, model in self.models.items():
            with self.subTest(model=model_id):
                self.assertEqual(model.template["display"]["panel_separator_color"], "#000000")

    def test_new_projects_leave_control_ranges_blank(self):
        # Like AVX 2026.03.0.28: with no min or max, the keypad uses its own
        # default range, which is 0 to 200 for the dial and LED ring.
        for model_id, model in self.models.items():
            page = model.template["pages"][0]
            controls = [page.get(k) for k in ("dial", "ledring", "dial_button")] + page["buttons"]
            for control in filter(None, controls):
                with self.subTest(model=model_id, control=control.get("name")):
                    self.assertNotIn("min", control)
                    self.assertNotIn("max", control)

    def test_page_limits(self):
        # The KP-V has no screen or buttons to switch pages, so it holds one.
        self.assertEqual({m: self.models[m].max_pages for m in self.models},
                         {"OMNI-KP-6B": None, "OMNI-KP-6BV": None, "OMNI-KP-8BV": None,
                          "OMNI-KP-V": 1})
        self.assertEqual(self.models["OMNI-KP-V"].summary()["max_pages"], 1)

    def test_misfit(self):
        kp_v = self.models["OMNI-KP-V"]
        template = kp_v.template
        self.assertIsNone(kp_v.misfit(template))
        page = template["pages"][0]
        self.assertEqual(kp_v.misfit({**template, "pages": [page, page]}),
                         "it has 2 pages, but a V holds 1")
        button = self.models["OMNI-KP-6BV"].template["pages"][0]["buttons"][0]
        self.assertEqual(kp_v.misfit({**template, "pages": [{**page, "buttons": [button]}]}),
                         "page 1 has 1 button, but a V has none")
        # Models with buttons aren't checked for button counts or pages.
        eight = self.models["OMNI-KP-8BV"].template
        self.assertIsNone(self.models["OMNI-KP-8BV"].misfit({**eight, "pages": [eight["pages"][0]] * 3}))

    def test_summary_has_no_template(self):
        summary = self.models["OMNI-KP-6BV"].summary()
        self.assertNotIn("template", summary)
        self.assertEqual(summary["id"], "OMNI-KP-6BV")


class BadModelTests(unittest.TestCase):
    def setUp(self):
        self.folder = Path(tempfile.mkdtemp()) / "models"
        shutil.copytree(MODELS_DIR, self.folder)
        self.path = self.folder / "OMNI-KP-6BV.json"
        self.data = json.loads(self.path.read_text(encoding="utf-8"))

    def write(self, data):
        self.path.write_text(json.dumps(data), encoding="utf-8")

    def test_bad_files_are_refused_with_their_name(self):
        cases = {
            "button count": {**self.data, "columns": 4},
            "dial flag": {**self.data, "dial": False},
            "missing field": {k: v for k, v in self.data.items() if k != "rows"},
            "id": {**self.data, "id": "OMNI-KP-9X"},
            "faceplate": {**self.data, "faceplate": "round"},
            "image size": {**self.data, "image_size": 0},
            "image size type": {**self.data, "image_size": "150"},
            "aliases type": {**self.data, "aliases": "OMNI-KP-T6BV"},
            "alias is another model": {**self.data, "aliases": ["OMNI-KP-8BV"]},
            "alias is another alias": {**self.data, "aliases": ["OMNI-KP-T8BV"]},
            "tabletop button count": {**self.data, "tabletop": {"columns": 4, "rows": 2}},
            "tabletop type": {**self.data, "tabletop": [3, 2]},
            "one side of the grid is zero": {**self.data, "columns": 0},
            "page limit zero": {**self.data, "max_pages": 0},
            "page limit type": {**self.data, "max_pages": "1"},
        }
        for case, data in cases.items():
            with self.subTest(case=case):
                self.write(data)
                with self.assertRaisesRegex(ValueError, "OMNI-KP-6BV.json"):
                    load_models(self.folder)

    def test_no_buttons_needs_a_dial(self):
        page = {k: v for k, v in self.data["template"]["pages"][0].items()
                if k not in DIAL_KEYS}
        self.write({**self.data, "columns": 0, "rows": 0, "dial": False, "tabletop": None,
                    "template": {**self.data["template"], "pages": [{**page, "buttons": []}]}})
        with self.assertRaisesRegex(ValueError, "a model with no buttons needs a dial"):
            load_models(self.folder)

    def test_tabletop_can_be_none(self):
        self.write({**self.data, "tabletop": None})
        self.assertIsNone(load_models(self.folder)["OMNI-KP-6BV"].tabletop)

    def test_tabletop_defaults_to_the_wall_grid(self):
        self.write({k: v for k, v in self.data.items() if k != "tabletop"})
        self.assertEqual(load_models(self.folder)["OMNI-KP-6BV"].tabletop, {"columns": 2, "rows": 3})

    def test_aliases_are_optional(self):
        self.write({k: v for k, v in self.data.items() if k != "aliases"})
        self.assertEqual(load_models(self.folder)["OMNI-KP-6BV"].aliases, ())

    def test_invalid_json_is_refused_with_its_name(self):
        self.path.write_text("{ nope", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "OMNI-KP-6BV.json"):
            load_models(self.folder)


if __name__ == "__main__":
    unittest.main()
