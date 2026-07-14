import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail } from "./email";
import { hashPassword, verifyPassword } from "./password";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }
    : undefined;
const facebook =
  process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
    ? {
        clientId: process.env.FACEBOOK_CLIENT_ID,
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
        mapProfileToUser: () => ({ emailVerified: false }),
      }
    : undefined;

export const auth = betterAuth({
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Camp Signal",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    password: {
      hash: hashPassword,
      verify: ({ hash: digest, password }) => verifyPassword(digest, password),
    },
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        text: `Use this time-limited link to reset your password: ${url}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your email",
        text: `Verify your email with this time-limited link: ${url}`,
      });
    },
  },
  socialProviders: {
    ...(google ? { google } : {}),
    // Facebook does not provide a reliable per-email verification signal. A site
    // verification email is therefore still required before member-only actions.
    ...(facebook ? { facebook } : {}),
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "email-password"],
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    crossSubDomainCookies: { enabled: false },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
