"""Exercise the bundled CLI from an unrelated cwd, without network access."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import trace
import unittest


REPO = Path(__file__).resolve().parents[1]
SKILL = Path(os.environ.get(
    "UI_UX_SKILL_ROOT", REPO / "codex/skills/frontend-ui-designer"
)).resolve()
VENDOR = SKILL / "vendor/ui-ux-pro-max"
ENTRY = VENDOR / "scripts/search.py"
OBSERVED = set()


class UiUxIntegration(unittest.TestCase):
    def setUp(self):
        # Direct imports must leave the vendored tree identical to its file manifest.
        self.addCleanup(setattr, sys, "dont_write_bytecode", sys.dont_write_bytecode)
        sys.dont_write_bytecode = True
        self.workspace = tempfile.TemporaryDirectory(prefix="ui ux integration ")
        self.addCleanup(self.workspace.cleanup)
        self.cwd = Path(self.workspace.name)
        self.traces = tempfile.TemporaryDirectory(prefix="ui-ux-traces-")
        self.addCleanup(self.traces.cleanup)

    def query(self, *args, json_output=True):
        counts = Path(self.traces.name) / "executed.counts"
        result = subprocess.run(
            [sys.executable, "-B", "-X", "utf8", "-m", "trace", "--count",
             "--coverdir", self.traces.name, "--file", str(counts),
             str(ENTRY), *args, *(["--json"] if json_output else [])],
            cwd=self.cwd, capture_output=True, text=True, encoding="utf-8",
            timeout=30, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        for filename, _ in trace.CoverageResults(infile=str(counts)).counts:
            if not Path(filename).is_absolute():
                continue
            try:
                OBSERVED.add(Path(filename).resolve().relative_to(REPO).as_posix())
            except ValueError:
                pass
        counts.unlink()
        return json.loads(result.stdout) if json_output else result.stdout

    def test_vendor_integrity_and_local_entrypoint(self):
        manifest = json.loads((VENDOR / "UPSTREAM.json").read_text("utf-8"))
        self.assertEqual(len(manifest["commit"]), 40)
        self.assertTrue(manifest["localModifications"])
        actual = {p.relative_to(VENDOR).as_posix() for p in VENDOR.rglob("*")
                  if p.is_file() and p.name != "UPSTREAM.json"}
        self.assertEqual(actual, set(manifest["files"]))
        for name, expected in manifest["files"].items():
            self.assertNotIn(b"\r\n", (VENDOR / name).read_bytes(), name)
            self.assertEqual(hashlib.sha256((VENDOR / name).read_bytes()).hexdigest(),
                             expected, name)
        self.assertIn("MIT License", (VENDOR / "LICENSE").read_text("utf-8"))
        self.assertIn("references/ui-ux-pro-max.md", (SKILL / "SKILL.md").read_text("utf-8"))
        self.assertTrue((SKILL / "references/ui-ux-pro-max.md").is_file())
        self.assertFalse(list(VENDOR.rglob("SKILL.md")))

    def test_ux_query_returns_applicable_error_summary_guidance(self):
        result = self.query("error summary validation", "--domain", "ux", "-n", "1")
        self.assertEqual(result["domain"], "ux")
        self.assertEqual(result["count"], 1)
        rule = result["results"][0]
        self.assertEqual(rule["Issue"], "Focusable Error Summary")
        self.assertIn("focus", rule["Do"])
        self.assertIn("inline", rule["Do"])
        self.assertEqual(list(self.cwd.iterdir()), [])

    def test_vendor_hashes_survive_git_checkout_line_endings(self):
        checkout = self.cwd / "git fixture"
        checkout.mkdir()
        shutil.copyfile(REPO / ".gitattributes", checkout / ".gitattributes")
        relative = Path("codex/skills/frontend-ui-designer/vendor/ui-ux-pro-max")
        shutil.copytree(VENDOR, checkout / relative)
        for args in (("init", "--quiet"), ("-c", "core.autocrlf=true", "add", ".")):
            subprocess.run(["git", *args], cwd=checkout, check=True,
                           capture_output=True, timeout=30)
        manifest = json.loads((VENDOR / "UPSTREAM.json").read_text("utf-8"))
        for autocrlf in ("true", "false"):
            destination = self.cwd / ("checkout-" + autocrlf)
            subprocess.run(["git", "-c", "core.autocrlf=" + autocrlf,
                            "checkout-index", "--all", "--prefix=" + destination.as_posix() + "/"],
                           cwd=checkout, check=True, capture_output=True, timeout=30)
            for name, expected in manifest["files"].items():
                content = (destination / relative / name).read_bytes()
                self.assertEqual(hashlib.sha256(content).hexdigest(), expected,
                                 "GIT_CHECKOUT_INTEGRITY: " + autocrlf + " " + name)

    def test_stack_query_resolves_react_data(self):
        result = self.query("virtualize lists", "--stack", "react", "-n", "1")
        self.assertEqual(result["stack"], "react")
        self.assertEqual(result["results"][0]["Guideline"], "Virtualize long lists")

    def test_no_match_remains_explicit(self):
        result = self.query("qzxvnohit987654321", "--domain", "ux")
        self.assertEqual(result["count"], 0)
        self.assertEqual(result["results"], [])

    def test_design_generation_exposes_fallback_and_density(self):
        # The skill no longer documents --design-system, but the vendored generator stays callable.
        result = self.query("manufacturing operations dashboard", "--design-system",
                            "--density", "8", "-p", "Operations")
        design = result["design_system"]
        self.assertEqual(design["project_name"], "Operations")
        self.assertEqual(design["dials"]["density"], 8)
        self.assertTrue(design["reasoning_default"])
        self.assertIsNone(design["source_identities"]["product"])
        self.assertIsNone(result["persistence"])
        self.assertEqual(list(self.cwd.iterdir()), [])

    def test_persistence_does_not_overwrite_existing_decisions(self):
        project = self.cwd / "project with spaces"
        args = ("analytics dashboard", "--design-system", "--persist",
                "--output-dir", str(project), "-p", "Integration Test")
        result = self.query(*args)
        master = next(project.rglob("MASTER.md"))
        self.assertEqual(result["persistence"]["status"], "success")
        self.assertTrue(master.read_text("utf-8").strip())
        marker = "# Existing approved design\nPreserve this decision.\n"
        master.write_text(marker, encoding="utf-8")
        result = self.query(*args)
        self.assertEqual(result["persistence"]["status"], "skipped_exists",
                         "PRESERVE_EXISTING_DESIGN")
        self.assertEqual(master.read_text("utf-8"), marker, "PRESERVE_EXISTING_DESIGN")
        result = self.query(*args, "--page", "dashboard")
        page = next(project.rglob("dashboard.md"))
        self.assertTrue(page.read_text("utf-8").strip())
        self.assertEqual(master.read_text("utf-8"), marker)
        page.write_text(marker, encoding="utf-8")
        self.query(*args, "--page", "dashboard")
        self.assertEqual(page.read_text("utf-8"), marker)
        self.assertEqual({p.name for p in self.cwd.iterdir()}, {project.name})

    def test_force_page_preserves_master_and_other_pages(self):
        args = ("SaaS", "--design-system", "--persist",
                "--output-dir", str(self.cwd), "-p", "Operations")
        self.query(*args, "--page", "dashboard")
        folder = self.cwd / "design-system/operations"
        master = folder / "MASTER.md"
        page = folder / "pages/dashboard.md"
        other = folder / "pages/settings.md"
        master.write_text("Approved master", encoding="utf-8")
        page.write_text("Old dashboard", encoding="utf-8")
        other.write_text("Approved settings", encoding="utf-8")
        self.query(*args, "--page", "dashboard", "--force")
        self.assertEqual(master.read_text("utf-8"), "Approved master", "PAGE_FORCE_SCOPE")
        self.assertNotEqual(page.read_text("utf-8"), "Old dashboard")
        self.assertEqual(other.read_text("utf-8"), "Approved settings")
        page_content = page.read_bytes()
        self.query(*args, "--force")
        self.assertNotEqual(master.read_text("utf-8"), "Approved master")
        self.assertEqual(page.read_bytes(), page_content)
        self.assertEqual(other.read_text("utf-8"), "Approved settings")

    def test_generated_references_resolve_to_persisted_files(self):
        self.query("SaaS", "--design-system", "--persist", "--page", "dashboard",
                   "--output-dir", str(self.cwd), "-p", "Operations")
        master = self.cwd / "design-system/operations/MASTER.md"
        page = master.parent / "pages/dashboard.md"
        for source, target in ((master, page), (page, master)):
            reference = re.search(r"`([^`]+\.md)`", source.read_text("utf-8"))[1]
            reference = reference.replace("[page-name]", "dashboard")
            self.assertEqual((source.parent / reference).resolve(), target.resolve())
            self.assertTrue((source.parent / reference).is_file())

    def test_blank_page_cli_rejects_without_writing(self):
        project = self.cwd / "existing"
        folder = project / "design-system/operations"
        (folder / "pages").mkdir(parents=True)
        (folder / "MASTER.md").write_bytes(b"Approved master\r\n")
        (folder / "pages/dashboard.md").write_bytes(b"Approved page\r\n")
        for output in (project, self.cwd / "absent"):
            before = {p.relative_to(self.cwd): p.read_bytes()
                      for p in self.cwd.rglob("*") if p.is_file()}
            for page in ("", "   ", "\t\n", "\u3000"):
                with self.subTest(output=output.name, page=repr(page)):
                    result = subprocess.run(
                        [sys.executable, "-B", "-X", "utf8", str(ENTRY), "SaaS",
                         "--design-system", "--persist", "-p", "Operations",
                         "--page", page, "--force", "--output-dir", str(output), "--json"],
                        cwd=self.cwd, capture_output=True, text=True, encoding="utf-8",
                        timeout=30, check=False,
                    )
                    self.assertEqual(result.returncode, 2, "BLANK_PAGE_REJECTED")
                    self.assertIn("page must not be blank", result.stderr)
                    self.assertEqual(before, {p.relative_to(self.cwd): p.read_bytes()
                                              for p in self.cwd.rglob("*") if p.is_file()})
                    self.assertFalse((self.cwd / "absent").exists())

    def test_blank_page_persistence_api_rejects_before_side_effects(self):
        sys.path.insert(0, str(VENDOR / "scripts"))
        try:
            from design_system import persist_design_system
            for page in ("", "   ", "\t\n", "\u3000"):
                with self.subTest(page=repr(page)):
                    with self.assertRaisesRegex(ValueError, "page must not be blank"):
                        persist_design_system({"project_name": "Operations"}, page=page,
                                              output_dir=str(self.cwd / "absent"), force=True)
                    self.assertEqual(list(self.cwd.iterdir()), [])
        finally:
            sys.path.pop(0)


if __name__ == "__main__":
    run = unittest.main(exit=False)
    print(json.dumps({"observedConsumers": sorted(OBSERVED)}))
    sys.exit(0 if run.result.wasSuccessful() else 1)
