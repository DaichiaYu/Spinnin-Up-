#!/usr/bin/env python3
"""Repository-level contracts that should remain true across agent edits."""
import importlib.util
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def load_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


class RepositoryContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.state = load_json("project-state.json")
        cls.exercises = load_json("data/exercises.json")["exercises"]
        cls.exercise_ids = {e["id"] for e in cls.exercises}
        cls.main_js = (ROOT / "src" / "main.js").read_text(encoding="utf-8")
        cls.routine_js = (ROOT / "src" / "routine-code.js").read_text(encoding="utf-8")

    def test_project_state_has_known_feature_statuses(self):
        allowed = {"done", "pending", "planned", "blocked"}
        for feature, status in self.state["features"].items():
            self.assertIn(status, allowed, f"{feature} has unknown status: {status}")

    def test_project_state_matches_current_architecture(self):
        architecture = self.state["architecture"]
        self.assertFalse(architecture["backend"])
        self.assertFalse(architecture["account_system"])
        self.assertEqual(architecture["exercise_data"], "data/exercises.json")
        self.assertTrue((ROOT / architecture["exercise_data"]).exists())

    def test_exercise_ids_are_unique_and_have_assets(self):
        ids = [e["id"] for e in self.exercises]
        self.assertEqual(len(ids), len(set(ids)), "exercise ids must remain unique")
        missing = [
            eid for eid in ids
            if not (ROOT / "assets" / "exercises" / f"{eid}.svg").exists()
        ]
        self.assertEqual(missing, [], f"missing generated SVGs: {missing}")

    def test_figure_generator_covers_every_exercise(self):
        spec = importlib.util.spec_from_file_location(
            "build_figures", ROOT / "tools" / "build_figures.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        generated_ids = set(module.POSES) | set(module.BACK_POSES)
        self.assertEqual(
            generated_ids,
            self.exercise_ids,
            "build_figures.py and exercises.json must cover the same exercise ids",
        )

    def test_public_test_hooks_are_not_removed(self):
        match = re.search(r"window\.__spin\s*=\s*\{(?P<body>.*?)\n\};", self.main_js, re.S)
        self.assertIsNotNone(match, "window.__spin test hook must remain available")
        body = match.group("body")
        for name in ("state", "db", "buildSteps", "totalSec", "encode", "decode", "buildICS", "player"):
            self.assertRegex(body, rf"\b{re.escape(name)}\b", f"window.__spin must expose {name}")

    def test_routine_format_keeps_version_marker(self):
        self.assertIn(
            "export const ROUTINE_VERSION = '1';",
            self.routine_js,
            "Routine Code v1 marker changed; update migration/compatibility deliberately",
        )

    def test_logic_modules_do_not_touch_the_page(self):
        """訓練邏輯、訓練代碼、行事曆、播放器的時間邏輯不能直接操作畫面（#13）。"""
        for name in ("workout-engine.js", "routine-code.js", "calendar.js", "player.js", "profile.js", "generator.js", "feedback.js"):
            text = (ROOT / "src" / name).read_text(encoding="utf-8")
            for banned in ("document.", "window.", "localStorage", "speechSynthesis"):
                self.assertNotIn(banned, text, f"src/{name} must not use {banned}")


if __name__ == "__main__":
    unittest.main()
