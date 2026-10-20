import unittest

from designer.bindings import describe_omni_bindings, describe_references


def binding(page, control, kind="omni", remote="BSS OMNI256P 1", path="/Audio/P1/Gain"):
    return {"page": page, "control": control, "kind": kind, "remote": remote, "path": path}


class DescribeTests(unittest.TestCase):
    def test_omni_bindings_are_grouped_by_page_and_device(self):
        self.assertEqual(describe_omni_bindings([
            binding(1, "dial"), binding(1, "ledring"), binding(1, "button3"), binding(1, "button5"),
            binding(2, "button1", remote="DAVID256P"),
        ]), [
            "Page 1: dial, LED ring, and buttons 3 and 5 are bound to BSS OMNI256P 1, "
            "so they aren't available over HControl.",
            "Page 2: button 1 is bound to DAVID256P, so it isn't available over HControl.",
        ])

    def test_script_references_get_their_own_sentence(self):
        reference = binding(1, "dial", kind="reference", remote="", path="Category_1/Reference_1")
        self.assertEqual(describe_omni_bindings([reference]), [])
        self.assertEqual(describe_references([reference]),
                         ["Page 1: dial uses the script reference Category_1/Reference_1."])


if __name__ == "__main__":
    unittest.main()
