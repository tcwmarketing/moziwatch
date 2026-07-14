import { Resend } from "resend";

type Message = { to: string; subject: string; text: string };

export async function sendEmail(message: Message) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production")
      throw new Error("RESEND_API_KEY is required in production");
    console.info(
      `[development email]\nTo: ${message.to}\nSubject: ${message.subject}\n${message.text}`,
    );
    return;
  }
  if (process.env.NODE_ENV === "production" && !from)
    throw new Error("RESEND_FROM is required in production");
  const { error } = await new Resend(apiKey).emails.send({
    from: from || "Camp Signal <onboarding@resend.dev>",
    ...message,
  });
  if (error) throw new Error(`Resend delivery failed: ${error.message}`);
}
