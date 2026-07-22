type Message = { to: string; subject: string; text: string };

type BrevoError = { message?: string; code?: string };

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

function parseSender(value: string) {
  const trimmed = value.trim();
  const named = /^(?:"?([^"<>]+?)"?\s*)?<([^<>]+)>$/.exec(trimmed);
  const email = (named?.[2] || trimmed).trim();
  const name =
    named?.[1]?.trim() || process.env.NEXT_PUBLIC_APP_NAME || "MoziWatch";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("EMAIL_FROM must contain a valid email address");

  return { name, email };
}

function configuredProvider() {
  const configured = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (configured === "brevo" || configured === "console") return configured;
  if (configured) throw new Error(`Unsupported EMAIL_PROVIDER: ${configured}`);
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.NODE_ENV === "production")
    throw new Error("EMAIL_PROVIDER is required in production");
  return "console";
}

export async function sendEmail(message: Message) {
  const provider = configuredProvider();
  if (provider === "console") {
    if (process.env.NODE_ENV === "production")
      throw new Error("Console email delivery is disabled in production");
    console.info(
      `[development email]\nTo: ${message.to}\nSubject: ${message.subject}\n${message.text}`,
    );
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) throw new Error("BREVO_API_KEY is required for Brevo delivery");
  if (!from) throw new Error("EMAIL_FROM is required for Brevo delivery");

  const response = await fetch(BREVO_SEND_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: parseSender(from),
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const result = (await response.json().catch(() => null)) as BrevoError | null;
  if (!response.ok) {
    const detail = result?.message ? `: ${result.message}` : "";
    throw new Error(`Brevo delivery failed (${response.status})${detail}`);
  }
}
