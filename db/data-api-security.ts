import type { Sql } from "postgres";

const dataApiRoles = ["anon", "authenticated", "service_role"];

/** Metadata only: never reads account, report, payment, or contact contents. */
export async function auditDataApiSecurity(client: Sql) {
  const tables = await client<
    { name: string; kind: string; rls: boolean; exposed_roles: string[] }[]
  >`
    SELECT c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls,
      ARRAY(
        SELECT r.rolname::text FROM pg_roles r
        WHERE r.rolname = ANY(${dataApiRoles})
          AND has_table_privilege(r.oid, c.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        ORDER BY r.rolname
      ) AS exposed_roles
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid AND d.deptype = 'e'
      )
    ORDER BY c.relname
  `;
  const sequences = await client<{ name: string; exposed_roles: string[] }[]>`
    SELECT c.relname AS name,
      ARRAY(
        SELECT r.rolname::text FROM pg_roles r
        WHERE r.rolname = ANY(${dataApiRoles})
          AND has_sequence_privilege(r.oid, c.oid, 'USAGE,SELECT,UPDATE')
        ORDER BY r.rolname
      ) AS exposed_roles
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid AND d.deptype = 'e'
      )
  `;
  const routines = await client<{ name: string; exposed_roles: string[] }[]>`
    SELECT p.oid::regprocedure::text AS name,
      ARRAY(
        SELECT r.rolname::text FROM pg_roles r
        WHERE r.rolname = ANY(${dataApiRoles})
          AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
        ORDER BY r.rolname
      ) AS exposed_roles
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid AND d.deptype = 'e'
      )
  `;
  const unsafeDefaults = await client<
    { creator: string; schema: string; kind: string; grantee: string }[]
  >`
    SELECT pg_get_userbyid(a.defaclrole) AS creator,
      coalesce(n.nspname, '*') AS schema, a.defaclobjtype AS kind,
      CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_get_userbyid(acl.grantee) END AS grantee
    FROM pg_default_acl a
    LEFT JOIN pg_namespace n ON n.oid = a.defaclnamespace
    CROSS JOIN LATERAL aclexplode(a.defaclacl) acl
    WHERE a.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
      AND (n.nspname = 'public' OR a.defaclnamespace = 0)
      AND a.defaclobjtype IN ('r', 'S', 'f')
      AND (acl.grantee = 0 OR acl.grantee IN (
        SELECT oid FROM pg_roles WHERE rolname = ANY(${dataApiRoles})
      ))
  `;
  const issues = [
    ...tables.flatMap((table) => [
      ...(["r", "p"].includes(table.kind) && !table.rls
        ? [`public.${table.name}: RLS disabled`]
        : []),
      ...(table.exposed_roles.length
        ? [`public.${table.name}: grants to ${table.exposed_roles.join(", ")}`]
        : []),
    ]),
    ...sequences
      .filter((item) => item.exposed_roles.length)
      .map((item) => `sequence ${item.name}: public API grants`),
    ...routines
      .filter((item) => item.exposed_roles.length)
      .map((item) => `routine ${item.name}: public API execution`),
    ...unsafeDefaults.map(
      (item) =>
        `default ${item.creator}/${item.schema}/${item.kind}: grants to ${item.grantee}`,
    ),
  ];
  return {
    tableCount: tables.length,
    issues,
    tables,
    sequences,
    routines,
    unsafeDefaults,
  };
}

export async function assertDataApiSecurity(client: Sql) {
  const audit = await auditDataApiSecurity(client);
  if (audit.issues.length) {
    throw new Error(
      `Database security check failed:\n${audit.issues.join("\n")}`,
    );
  }
  return audit;
}
