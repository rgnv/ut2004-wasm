#!/usr/bin/env python3
"""Index names only; package bytes remain in the HTTP-served data tree."""
import json
import argparse
from pathlib import Path
root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data', type=Path, default=root / 'data3374')
parser.add_argument('--output', type=Path, default=root / 'build/web')
args = parser.parse_args()
data = args.data.resolve()
files = sorted(p.relative_to(data).as_posix() for p in data.rglob('*') if p.is_file())
assert 'System/Core.u' in files and 'Maps/NvidiaLogo.ut2' in files
args.output.mkdir(parents=True, exist_ok=True)
(args.output / 'files.json').write_text(json.dumps(files))
(args.output / 'file-sizes.json').write_text(json.dumps({p: (data / p).stat().st_size for p in files}))
print(f'HTTP manifest: {len(files)} files from {data} (no bundled data)')
