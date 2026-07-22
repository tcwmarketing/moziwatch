"use client";

import type { RecaptchaAction } from "@/lib/recaptcha-actions";

type RecaptchaEnterprise = {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

declare global {
  interface Window {
    grecaptcha?: { enterprise?: RecaptchaEnterprise };
  }
}

async function waitForRecaptcha() {
  const startedAt = Date.now();
  while (!window.grecaptcha?.enterprise) {
    if (Date.now() - startedAt > 8_000)
      throw new Error("reCAPTCHA Enterprise did not load.");
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return window.grecaptcha.enterprise;
}

export async function createRecaptchaToken(action: RecaptchaAction) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey) return undefined;

  const enterprise = await waitForRecaptcha();
  await new Promise<void>((resolve) => enterprise.ready(resolve));
  return enterprise.execute(siteKey, { action });
}
