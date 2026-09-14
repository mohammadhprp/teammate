"""Tests for the Team Mate scripts.

The test modules import ``tm`` and ``task_store`` as top-level modules, so the
package adds the parent directory (``src/scripts``) to the import path.
"""

import os
import sys

_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)
