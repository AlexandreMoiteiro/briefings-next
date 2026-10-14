"""Offline regression tests for the AEMET aviation chart collector."""
import importlib.util
import pathlib
import unittest
from datetime import datetime, timezone

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aemet-collector.py"
spec = importlib.util.spec_from_file_location("aemet_collector", SCRIPT)
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class ChartCollectorTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 15, 0, 35, tzinfo=timezone.utc)
        self.sig = "https://ama.aemet.es/chart/{valid_date}/{valid_hour}.png"
        self.wind = "https://ama.aemet.es/chart/{run_date}/{run_hour}/{lead}/{flight_level}.png"

    def test_forecast_file_names_match_briefings_api(self):
        entries = collector.source_urls(self.now, self.sig, self.wind)
        self.assertEqual(len(entries), 86)
        self.assertTrue(any(path == "sigwx/2026-10-15_06.png" for path, _ in entries))
        self.assertTrue(any(path == "wind-temp/20261014_HMAR12_H003_FL020.png" for path, _ in entries))
        self.assertTrue(all(
            collector.SIGWX.fullmatch(path) or collector.WIND.fullmatch(path)
            for path, _ in entries
        ))

    def test_forecast_cycles_roll_over_midnight(self):
        paths = [path for path, _ in collector.source_urls(self.now, self.sig, self.wind)]
        self.assertIn("sigwx/2026-10-14_18.png", paths)
        self.assertIn("sigwx/2026-10-16_00.png", paths)
        self.assertIn("wind-temp/20261015_HMAR00_H030_FL150.png", paths)

    def test_reject_undated_templates(self):
        with self.assertRaises(ValueError):
            collector.source_urls(self.now, "https://ama.aemet.es/latest.png", self.wind)
        with self.assertRaises(ValueError):
            collector.source_urls(self.now, self.sig, "https://ama.aemet.es/latest.png")

    def test_only_official_aemet_hosts_allowed(self):
        collector.validate_aemet_url("https://ama.aemet.es/test.png")
        collector.validate_aemet_url("https://amatos.aemet.es/test.png")
        for url in (
            "http://ama.aemet.es/chart.png",
            "https://ama.aemet.es.evil.example/chart.png",
            "https://not-aemet.example/chart.png",
        ):
            with self.assertRaises(ValueError):
                collector.validate_aemet_url(url)


if __name__ == "__main__":
    unittest.main()
