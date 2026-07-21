import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { sqlClient } from "@/db";
import { hashPassword } from "@/lib/password";

const emailArgument = process.argv
  .slice(2)
  .find((value) => value.startsWith("--email="));
const email = (emailArgument?.slice("--email=".length) || "")
  .trim()
  .toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error("Use --email=person@example.com with a valid email address");

const result = await sqlClient.begin(async (tx) => {
  const matches = await tx<
    Array<{
      id: string;
      role: string;
      email_verified: boolean;
      disabled_at: Date | null;
    }>
  >`
    SELECT id, role, email_verified, disabled_at
    FROM "user" WHERE lower(email) = ${email}
    ORDER BY created_at FOR UPDATE
  `;
  if (matches.length > 1)
    throw new Error("Multiple case-variant accounts use this email address");

  let userId = matches[0]?.id;
  const created = !userId;
  if (!userId) {
    userId = nanoid();
    await tx`
      INSERT INTO "user" (
        id, name, email, email_verified, role, disabled_at
      ) VALUES (
        ${userId}, 'MoziWatch Administrator', ${email}, true, 'admin', null
      )
    `;
  } else {
    await tx`
      UPDATE "user" SET email = ${email}, email_verified = true,
        role = 'admin', disabled_at = null, updated_at = now()
      WHERE id = ${userId}
    `;
  }

  const credentials = await tx<{ id: string }[]>`
    SELECT id FROM account
    WHERE user_id = ${userId} AND provider_id = 'credential'
    LIMIT 1
  `;
  let credentialCreated = false;
  if (!credentials[0]) {
    const temporaryPassword = randomBytes(32).toString("base64url");
    const passwordDigest = await hashPassword(temporaryPassword);
    await tx`
      INSERT INTO account (
        id, account_id, provider_id, user_id, password
      ) VALUES (
        ${nanoid()}, ${userId}, 'credential', ${userId}, ${passwordDigest}
      )
    `;
    credentialCreated = true;
  }

  return { created, credentialCreated };
});

const verification = await sqlClient<
  Array<{
    role: string;
    email_verified: boolean;
    disabled_at: Date | null;
    has_credential: boolean;
  }>
>`
  SELECT u.role, u.email_verified, u.disabled_at,
    EXISTS (
      SELECT 1 FROM account a
      WHERE a.user_id = u.id AND a.provider_id = 'credential'
    ) AS has_credential
  FROM "user" u WHERE lower(u.email) = ${email}
`;
await sqlClient.end();

const account = verification[0];
if (
  !account ||
  account.role !== "admin" ||
  !account.email_verified ||
  account.disabled_at ||
  !account.has_credential
)
  throw new Error("Administrator account verification failed");

console.log(
  JSON.stringify({
    email,
    accountCreated: result.created,
    credentialCreated: result.credentialCreated,
    role: account.role,
    emailVerified: account.email_verified,
    enabled: !account.disabled_at,
    hasCredential: account.has_credential,
  }),
);
