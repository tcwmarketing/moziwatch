import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};
export default function SignUpPage() {
  return (
    <div className="auth-page">
      <AuthForm mode="sign-up" />
    </div>
  );
}
