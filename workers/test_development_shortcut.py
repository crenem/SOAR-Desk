"""Static and shell-syntax regression for independent Windows dev shortcut."""
import json
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


class DevelopmentLauncherTests(unittest.TestCase):
    def test_scripts_parse_in_bash_without_execution(self):
        paths=["scripts/launch-development.sh",
               "scripts/launch-wsl.sh","scripts/launch-wsl-cuda.sh"]
        completed=subprocess.run(["bash","-n",*[str(ROOT/p) for p in paths]],
                                 check=False,capture_output=True,text=True)
        self.assertEqual(completed.returncode,0,completed.stderr)

    def test_development_launcher_has_dedicated_branch_and_profile(self):
        dev=(ROOT/"scripts/launch-development.sh").read_text()
        self.assertIn('DEV_BRANCH="development/local"',dev)
        self.assertIn('SOAR_DESK_ROOT="$DEV_ROOT"',dev)
        self.assertIn("XDG_CONFIG_HOME=",dev)
        self.assertIn("XDG_DATA_HOME=",dev)
        self.assertIn("XDG_CACHE_HOME=",dev)
        self.assertIn("SOAR_DESK_VITE_PORT=1421",dev)
        self.assertIn('actual_branch',dev)
        self.assertNotIn("reset --hard",dev)
        self.assertNotIn("git clean",dev)
        self.assertNotIn("git stash",dev)

    def test_existing_main_defaults_are_not_changed(self):
        launcher=(ROOT/"scripts/launch-wsl.sh").read_text()
        cuda=(ROOT/"scripts/launch-wsl-cuda.sh").read_text()
        self.assertIn('$'+'{SOAR_DESK_ROOT:-$HOME/Projects/SOAR-Desk}',launcher)
        self.assertIn('$'+'{SOAR_DESK_UPDATE_BRANCH:-main}',launcher)
        self.assertIn('$'+'{SOAR_DESK_ROOT:-$HOME/Projects/SOAR-Desk}',cuda)
        self.assertIn('git merge --ff-only "origin/$UPDATE_BRANCH"',launcher)
        self.assertIn('[[ "$DEVELOPMENT" != 1 ]]',launcher)
        self.assertIn('tauri.development.conf.json',launcher)
        self.assertNotIn("reset --hard",launcher)

    def test_dev_app_identity_and_ports_are_distinct(self):
        original=json.loads((ROOT/"apps/desktop/src-tauri/tauri.conf.json").read_text())
        dev=json.loads((ROOT/"apps/desktop/src-tauri/tauri.development.conf.json").read_text())
        self.assertNotEqual(original["identifier"],dev["identifier"])
        self.assertEqual(original["build"]["devUrl"],"http://localhost:1420")
        self.assertEqual(dev["build"]["devUrl"],"http://localhost:1421")
        self.assertNotEqual(original["app"]["windows"][0]["title"],
                            dev["app"]["windows"][0]["title"])
        vite=(ROOT/"apps/desktop/vite.config.ts").read_text()
        self.assertIn('process.env.SOAR_DESK_DEVELOPMENT === "1" ? 1421 : 1420',vite)

    def test_windows_installer_only_writes_named_development_shortcut(self):
        installer=(ROOT/"scripts/create-windows-development-shortcut.ps1").read_text()
        self.assertIn("SOAR Desk - Development.lnk",installer)
        self.assertIn("Launch SOAR Desk Development.cmd",installer)
        self.assertIn("development/local",installer)
        self.assertIn("SOAR_DEV_ACCELERATOR=",installer)
        self.assertNotIn("SOAR Desk.lnk",installer)
        self.assertNotIn("SOAR Desk - NVIDIA CUDA.lnk",installer)
        self.assertNotIn("reset --hard",installer)


if __name__=="__main__":
    unittest.main()
