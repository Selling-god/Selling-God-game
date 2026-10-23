"""Run after generate_art.py when rebuilding the original sprite atlas."""
from pathlib import Path
import json
path=Path(__file__).resolve().parents[1]/"public/assets/atlas.json"
data=json.loads(path.read_text())
for dest,source in {"atlas_coat":"explorer_coat","pilgrim_charm":"relic_charm","memory_crown":"dawn_charm"}.items():
    for direction in "snew":
        for frame in range(4):
            data[f"gear_{dest}_{direction}_{frame}"]=data[f"gear_{source}_{direction}_{frame}"].copy()
path.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
