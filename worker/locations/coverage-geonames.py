#!/usr/bin/env python3
"""Emit Canadian and US populated places for campground coverage auditing."""

from __future__ import annotations

import json
import sys
import urllib.request
import zipfile
from pathlib import Path

DATA_URL = "https://download.geonames.org/export/dump/cities500.zip"


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    cache_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "data/locations/geonames")
    minimum_population = int(sys.argv[2] if len(sys.argv) > 2 else "10000")
    cache_dir.mkdir(parents=True, exist_ok=True)
    archive = cache_dir / "cities500.zip"
    if not archive.exists():
        urllib.request.urlretrieve(DATA_URL, archive)

    with zipfile.ZipFile(archive) as source:
        with source.open("cities500.txt") as rows:
            for raw in rows:
                fields = raw.decode("utf-8").rstrip("\n").split("\t")
                if len(fields) < 15 or fields[8] not in {"US", "CA"}:
                    continue
                population = int(fields[14] or "0")
                if population < minimum_population:
                    continue
                print(
                    json.dumps(
                        {
                            "geonameId": fields[0],
                            "name": fields[1],
                            "latitude": float(fields[4]),
                            "longitude": float(fields[5]),
                            "country": fields[8],
                            "region": fields[10],
                            "population": population,
                        },
                        ensure_ascii=False,
                    )
                )


if __name__ == "__main__":
    main()
