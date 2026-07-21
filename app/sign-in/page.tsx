import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export default function SignInPage() {
  return (
    <div className="auth-page">
      <AuthForm mode="sign-in" />
    </div>
  );
}
