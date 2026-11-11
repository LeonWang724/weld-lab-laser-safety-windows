import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('windows_launcher', Path(__file__).resolve().parents[1] / 'windows/launch.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class BrowserDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        root_patch = patch.object(launcher, 'ROOT', self.root)
        root_patch.start()
        self.addCleanup(root_patch.stop)

    def test_setup_record_handles_non_ascii_paths(self):
        browser = self.root / 'François Browser' / 'firefox.exe'
        browser.parent.mkdir()
        browser.touch()
        (self.root / 'browser-path.txt').write_text(str(browser), encoding='utf-8')
        self.assertEqual(launcher.find_firefox(), str(browser))

    def test_removed_external_browser_falls_back_to_private_copy(self):
        (self.root / 'browser-path.txt').write_text(str(self.root / 'missing.exe'), encoding='utf-8')
        browser = self.root / 'browser/firefox.exe'
        browser.parent.mkdir()
        browser.touch()
        self.assertEqual(launcher.find_firefox(), str(browser))

    def test_missing_browser_has_actionable_error(self):
        with patch.object(launcher.shutil, 'which', return_value=None), patch.dict(launcher.os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'Install Firefox'):
                launcher.find_firefox()


if __name__ == '__main__':
    unittest.main()
