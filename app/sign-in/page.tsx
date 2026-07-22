import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ passwordReset?: string }>;
}) {
  const { passwordReset } = await searchParams;

  return (
    <div className="auth-page">
      <AuthForm
        mode="sign-in"
        initialMessage={
          passwordReset === "success"
            ? "Your password has been updated. Sign in with your new password."
            : ""
        }
      />
    </div>
  );
}
