import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { assertDisposableTestDatabase } from "@/lib/test-database";
import { maintenanceDatabaseUrl } from "@/db/maintenance-url";
import {
  assertDataApiSecurity,
  auditDataApiSecurity,
} from "@/db/data-api-security";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "Supabase Data API protection",
  () => {
    it("protects existing tables and gives new objects private defaults", async () => {
      const client = postgres(
        maintenanceDatabaseUrl({
          DATABASE_URL: assertDisposableTestDatabase(),
        }),
        { max: 1, prepare: false },
      );
      // All DDL is rolled back; this suite can only target the disposable DB.
      const rollback = new Error("rollback security probes");
      try {
        await expect(
          client.begin(async (tx) => {
            const audit = await assertDataApiSecurity(
              tx as unknown as postgres.Sql,
            );
            expect(audit.tableCount).toBeGreaterThan(0);
            await tx`CREATE TABLE public.security_probe (id integer)`;
            await tx`CREATE SEQUENCE public.security_probe_seq`;
            await tx`CREATE FUNCTION public.security_probe_fn() RETURNS integer
          LANGUAGE sql AS 'SELECT 1'`;
            const created = await auditDataApiSecurity(
              tx as unknown as postgres.Sql,
            );
            expect(
              created.tables.find((table) => table.name === "security_probe")
                ?.exposed_roles,
            ).toEqual([]);
            expect(
              created.sequences.find(
                (item) => item.name === "security_probe_seq",
              )?.exposed_roles,
            ).toEqual([]);
            expect(
              created.routines.find((item) =>
                item.name.includes("security_probe_fn"),
              )?.exposed_roles,
            ).toEqual([]);
            expect(created.issues).toContain(
              "public.security_probe: RLS disabled",
            );
            await tx`ALTER TABLE public.security_probe ENABLE ROW LEVEL SECURITY`;
            await tx`GRANT SELECT ON public.security_probe TO anon`;
            const granted = await auditDataApiSecurity(
              tx as unknown as postgres.Sql,
            );
            expect(granted.issues).toContain(
              "public.security_probe: grants to anon",
            );
            // Verify the actual anon role cannot read rows even with a table grant.
            await tx`INSERT INTO public.security_probe VALUES (1)`;
            await tx`SET LOCAL ROLE anon`;
            expect(await tx`SELECT * FROM public.security_probe`).toHaveLength(
              0,
            );
            await tx`RESET ROLE`;
            await tx`REVOKE SELECT ON public.security_probe FROM anon`;
            await assertDataApiSecurity(tx as unknown as postgres.Sql);
            throw rollback;
          }),
        ).rejects.toBe(rollback);
        await assertDataApiSecurity(client);
      } finally {
        await client.end({ timeout: 5 });
      }
    });
  },
);
