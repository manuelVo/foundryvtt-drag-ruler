#!/usr/bin/env python3

import sys
import subprocess
from pathlib import Path

root_dir = Path(".")
wasm_dir = root_dir / Path("wasm")
rust_dir = root_dir / Path("rust")

debug = " --debug" if len(sys.argv) >= 2 and sys.argv[1] == "--debug" else ""

result = subprocess.run(["cargo", "watch", "-C" , rust_dir, "-s", f"wasm-pack build --target web --out-dir {wasm_dir.resolve()}{debug}"])
