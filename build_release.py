#!/usr/bin/env python3

import json
from pathlib import PurePath, Path
import subprocess
import tempfile
import zipfile

wasm_pack = Path("~/.cargo/bin/wasm-pack").expanduser()

root_files = ["module.json", "README.md", "CHANGELOG.md", "LICENSE"]
wasm_files = ["gridless_pathfinding_bg.wasm", "gridless_pathfinding.js"]
output_dir = Path("artifact")
copy_everything_directories = ["js", "lang", "templates"]
wasm_dir = Path("wasm")
root_dir = Path(".")
rust_dir = Path("rust")
build_dir_tmp = tempfile.TemporaryDirectory()
build_dir = Path(build_dir_tmp.name)

with open("module.json", "r") as file:
	manifest = json.load(file)

zip_root = PurePath(f'{manifest["name"]}')

filename = f'{manifest["name"]}-{manifest["version"]}.zip'

result = subprocess.run([wasm_pack, "build", "--target", "web", "--out-dir", build_dir, root_dir / rust_dir])
if result.returncode != 0:
	raise Exception("Wasm build failed")

output_dir.mkdir(parents=True, exist_ok=True)

def write_directory(archive, d):
	for f in (root_dir / d).iterdir():
		if f.is_dir():
			write_directory(archive, f)
		else:
			assert(f.is_file())
			archive.write(f, arcname=zip_root / d / f.name)

with zipfile.ZipFile(output_dir / filename, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
	for f in root_files:
		archive.write(root_dir / f, arcname=zip_root / f)
	for d in copy_everything_directories:
		write_directory(archive, d)
	for f in wasm_files:
		archive.write(build_dir / f, arcname=zip_root / wasm_dir / f)

print(f"Successfully built {output_dir / filename}")
