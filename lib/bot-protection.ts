export async function verifyBotProtection(
  token: string | undefined,
  ip: string,
) {
  if ((process.env.BOT_PROTECTION_PROVIDER || "none") === "none") return true;
  if (!process.env.TURNSTILE_SECRET_KEY || !token) return false;
  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY,
    response: token,
    remoteip: ip,
  });
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}
