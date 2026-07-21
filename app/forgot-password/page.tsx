import type { Metadata } from "next";
import { PasswordReset } from "@/components/password-reset";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};
export default function ForgotPasswordPage() {
  return (
    <div className="auth-page">
      <PasswordReset />
    </div>
  );
}
