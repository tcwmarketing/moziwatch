import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import type postgres from "postgres";

type Archive = {
  author: string;
  createdAt: string;
  rows: number;
  fingerprint: string;
  sha256: string;
};
type Connection = postgres.ReservedSql;
const rowDigest = (value: string) =>
  createHash("md5").update(value).digest("hex");
const fingerprint = () => createHash("sha256");

async function fileDigest(path: string) {
  const hash = fingerprint();
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function* lines(path: string) {
  const input = createReadStream(path);
  const unzipped = createGunzip();
  input.on("error", (error) => unzipped.destroy(error));
  input.pipe(unzipped);
  const reader = createInterface({ input: unzipped, crlfDelay: Infinity });
  try {
    for await (const line of reader) if (line) yield line;
  } finally {
    reader.close();
    input.destroy();
    unzipped.destroy();
  }
}

export async function backupWeather(session: Connection, path: string) {
  let rows = 0;
  const hash = fingerprint();
  async function* source() {
    // Sort only UUIDs in PostgreSQL. Sorting complete JSON payloads can spill
    // to a temporary file, which cannot work on a completely full database disk.
    const ids = await session<
      { id: string }[]
    >`SELECT id FROM public.weather_observations ORDER BY id`;
    for (let offset = 0; offset < ids.length; offset += 5) {
      const batch = await session<{ id: string; payload: string }[]>`
        SELECT w.id, row_to_json(w)::text AS payload FROM public.weather_observations w
        WHERE w.id = ANY(${ids.slice(offset, offset + 5).map((row) => row.id)}::uuid[])
      `;
      for (const row of batch.sort((a, b) => a.id.localeCompare(b.id))) {
        rows++;
        hash.update(`${row.id}:${rowDigest(row.payload)}\n`);
        yield `${row.payload}\n`;
      }
    }
  }
  await pipeline(
    Readable.from(source()),
    createGzip({ level: 6 }),
    createWriteStream(path, { flags: "wx", mode: 0o600 }),
  );
  const archive: Archive = {
    author: "The Complete Webdesigner",
    createdAt: new Date().toISOString(),
    rows,
    fingerprint: hash.digest("hex"),
    sha256: await fileDigest(path),
  };
  await writeFile(`${path}.manifest.json`, JSON.stringify(archive, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  return archive;
}

async function validateArchive(path: string): Promise<Archive> {
  const archive = JSON.parse(
    await readFile(`${path}.manifest.json`, "utf8"),
  ) as Archive;
  if (!Number.isInteger(archive.rows) || archive.rows < 1)
    throw new Error("Refusing an empty/invalid weather archive");
  if ((await fileDigest(path)) !== archive.sha256)
    throw new Error("Weather archive file checksum mismatch");
  const hash = fingerprint();
  let rows = 0;
  for await (const line of lines(path)) {
    const row = JSON.parse(line);
    if (typeof row.id !== "string" || typeof row.run_id !== "string")
      throw new Error("Invalid archived weather row");
    rows++;
    hash.update(`${row.id}:${rowDigest(line)}\n`);
  }
  if (rows !== archive.rows || hash.digest("hex") !== archive.fingerprint)
    throw new Error("Weather archive row verification failed");
  return archive;
}

async function databaseFingerprint(session: Connection) {
  const hash = fingerprint();
  let rows = 0;
  for await (const batch of session<{ id: string; digest: string }[]>`
    SELECT w.id, md5(row_to_json(w)::text) AS digest FROM public.weather_observations w ORDER BY w.id
  `.cursor(100)) {
    for (const row of batch) {
      rows++;
      hash.update(`${row.id}:${row.digest}\n`);
    }
  }
  return { rows, fingerprint: hash.digest("hex") };
}

/** Restore is resumable from the private verified archive if a connection fails. */
export async function compactWeatherFromArchive(
  session: Connection,
  path: string,
  resume = false,
) {
  const archive = await validateArchive(path);
  if (!resume) {
    await session`BEGIN`;
    try {
      await session`LOCK TABLE public.weather_observations IN ACCESS EXCLUSIVE MODE`;
      const current = await databaseFingerprint(session);
      if (
        current.rows !== archive.rows ||
        current.fingerprint !== archive.fingerprint
      )
        throw new Error(
          "Weather changed since backup; refusing to replace the table",
        );
      // Commit the empty relation so PostgreSQL can release its old physical
      // files before restoring. There is deliberately no CASCADE.
      await session`TRUNCATE TABLE public.weather_observations`;
      await session`COMMIT`;
    } catch (error) {
      await session`ROLLBACK`;
      throw error;
    }
  }
  let batch: string[] = [];
  const restore = async () => {
    if (!batch.length) return;
    await session`
      INSERT INTO public.weather_observations
      SELECT * FROM jsonb_populate_recordset(NULL::public.weather_observations, ${`[${batch.join(",")}]`}::text::jsonb)
      ON CONFLICT (id) DO NOTHING
    `;
    batch = [];
  };
  for await (const line of lines(path)) {
    batch.push(line);
    if (batch.length === 5) {
      await restore();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await restore();
  const after = await databaseFingerprint(session);
  if (after.rows !== archive.rows || after.fingerprint !== archive.fingerprint)
    throw new Error(
      "Restored weather verification failed; retain archive and resume recovery",
    );
  await session`ANALYZE public.weather_observations`;
  return { rowsRestored: after.rows, allRowChecksumsMatch: true };
}
