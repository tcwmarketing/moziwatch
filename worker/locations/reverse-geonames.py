#!/usr/bin/env python3
"""Offline nearest-place lookup for campground coordinates.

Downloads the CC BY 4.0 GeoNames cities500 dataset once, then accepts JSON
objects containing id/latitude/longitude on stdin and emits JSON objects with
the nearest populated place and first-order administrative code on stdout.
"""

from __future__ import annotations

import json
import math
import sys
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

DATA_URL = "https://download.geonames.org/export/dump/cities500.zip"


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def load_places(cache_dir: Path):
    cache_dir.mkdir(parents=True, exist_ok=True)
    archive = cache_dir / "cities500.zip"
    if not archive.exists():
        urllib.request.urlretrieve(DATA_URL, archive)
    buckets = defaultdict(list)
    with zipfile.ZipFile(archive) as source:
        with source.open("cities500.txt") as rows:
            for raw in rows:
                fields = raw.decode("utf-8").rstrip("\n").split("\t")
                if len(fields) < 11 or fields[8] not in {"US", "CA"}:
                    continue
                latitude, longitude = float(fields[4]), float(fields[5])
                place = (latitude, longitude, fields[2] or fields[1], fields[8], fields[10])
                buckets[(math.floor(latitude), math.floor(longitude))].append(place)
    return buckets


def nearest(buckets, latitude: float, longitude: float, country: str):
    origin = (math.floor(latitude), math.floor(longitude))
    candidates = []
    # Remote northern campgrounds can be several degrees from a settlement.
    # Expanding the grid is still inexpensive because only unresolved records
    # reach the wider rings.
    for radius in range(0, 46):
        for lat_offset in range(-radius, radius + 1):
            for lon_offset in range(-radius, radius + 1):
                if radius and abs(lat_offset) != radius and abs(lon_offset) != radius:
                    continue
                candidates.extend(
                    place
                    for place in buckets.get((origin[0] + lat_offset, origin[1] + lon_offset), [])
                    if place[3] == country
                )
        if candidates:
            break
    if not candidates:
        return None
    return min(
        candidates,
        key=lambda place: distance_km(latitude, longitude, place[0], place[1]),
    )


def main() -> None:
    cache_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "data/locations/geonames")
    buckets = load_places(cache_dir)
    for line in sys.stdin:
        item = json.loads(line)
        place = nearest(
            buckets,
            float(item["latitude"]),
            float(item["longitude"]),
            str(item["country"]),
        )
        if not place:
            continue
        kilometers = distance_km(
            float(item["latitude"]), float(item["longitude"]), place[0], place[1]
        )
        city = place[2]
        print(
            json.dumps(
                {
                    "id": item["id"],
                    "city": city,
                    "region": place[4],
                    "distanceKm": round(kilometers, 1),
                },
                ensure_ascii=False,
            )
        )


if __name__ == "__main__":
    main()
