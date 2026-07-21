#!/usr/bin/env python3
"""Stream exact-category Overture campground places as JSON Lines."""

import argparse
import json
import sys

try:
    import duckdb
except ImportError as exc:
    raise SystemExit(
        "DuckDB is required. Run: python -m pip install -r requirements-locations.txt"
    ) from exc


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--release", required=True)
    parser.add_argument("--country", choices=("CA", "US"), required=True)
    parser.add_argument("--region")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    source = (
        "s3://overturemaps-us-west-2/release/"
        f"{args.release}/theme=places/type=place/*"
    )
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    conditions = [
        "(categories.primary = 'campground' OR list_contains(categories.alternate, 'campground'))",
        "coalesce(operating_status, '') <> 'permanently_closed'",
        "list_contains(list_transform(addresses, a -> a.country), ?)",
    ]
    values = [args.country]
    if args.country == "CA":
        conditions.append(
            "list_has_any(list_transform(addresses, a -> upper(coalesce(a.region, ''))), "
            "['AB', 'ALBERTA', 'SK', 'SASKATCHEWAN', 'MB', 'MANITOBA', "
            "'ON', 'ONTARIO', 'QC', 'QUEBEC', 'QUÉBEC', 'NB', 'NEW BRUNSWICK', "
            "'NS', 'NOVA SCOTIA', 'PE', 'PEI', 'PRINCE EDWARD ISLAND', "
            "'NL', 'NEWFOUNDLAND AND LABRADOR', 'YT', 'YUKON', "
            "'NT', 'NORTHWEST TERRITORIES', 'NU', 'NUNAVUT'])"
        )
    if args.region:
        conditions.append(
            "list_contains(list_transform(addresses, a -> a.region), ?)"
        )
        values.append(args.region)

    limit = f"LIMIT {max(1, args.limit)}" if args.limit else ""
    sql = f"""
        SELECT
          id,
          names.primary AS name,
          categories.primary AS primary_category,
          to_json(categories.alternate) AS alternate_categories,
          confidence,
          list_extract(websites, 1) AS website,
          list_extract(list_filter(addresses, a -> a.country = '{args.country}'), 1).country AS country,
          list_extract(list_filter(addresses, a -> a.country = '{args.country}'), 1).region AS region,
          list_extract(list_filter(addresses, a -> a.country = '{args.country}'), 1).locality AS locality,
          list_extract(list_filter(addresses, a -> a.country = '{args.country}'), 1).freeform AS address,
          operating_status,
          version,
          (bbox.xmin + bbox.xmax) / 2 AS longitude,
          (bbox.ymin + bbox.ymax) / 2 AS latitude,
          to_json(sources) AS sources
        FROM read_parquet('{source}', filename=true, hive_partitioning=1)
        WHERE {' AND '.join(conditions)}
          AND names.primary IS NOT NULL
        {limit}
    """
    cursor = con.execute(sql, values)
    columns = [column[0] for column in cursor.description]
    while True:
        rows = cursor.fetchmany(1000)
        if not rows:
            break
        for row in rows:
            print(json.dumps(dict(zip(columns, row)), ensure_ascii=False, default=str))
            sys.stdout.flush()


if __name__ == "__main__":
    main()
