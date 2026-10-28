import { resolve } from "node:path";
import postgres from "postgres";
import { maintenanceDatabaseUrl } from "@/db/maintenance-url";
import {
  backupWeather,
  compactWeatherFromArchive,
} from "./weather-storage-archive";

const argument = process.argv.find((value) => value.startsWith("--file="));
if (!argument)
  throw new Error("Specify --file=/private/path/weather-backup.jsonl.gz");
const path = resolve(argument.slice(7));
const apply = process.argv.includes("--apply");
const resume = process.argv.includes("--resume");
const client = postgres(maintenanceDatabaseUrl(), {
  max: 1,
  prepare: false,
  connect_timeout: 15,
});
const session = await client.reserve();
try {
  await session`SET timezone = 'UTC'`;
  if (apply || resume) {
    const [state] = await session`SELECT pg_is_in_recovery() AS replica`;
    if (state.replica) throw new Error("Refusing recovery on a replica");
    await session`SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE`;
    await session`SET lock_timeout = '3s'`;
    await session`SET statement_timeout = '180s'`;
    console.log(
      JSON.stringify(await compactWeatherFromArchive(session, path, resume)),
    );
  } else {
    console.log(
      JSON.stringify({ backup: path, ...(await backupWeather(session, path)) }),
    );
  }
} finally {
  try {
    await session`RESET default_transaction_read_only`;
    await session`RESET timezone`;
  } finally {
    session.release();
    await client.end();
  }
}
