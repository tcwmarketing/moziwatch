import { Suspense } from "react";
import { NewPasswordForm } from "@/components/new-password-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="auth-page">
      <Suspense
        fallback={<div className="auth-card">Loading secure reset...</div>}
      >
        <NewPasswordForm />
      </Suspense>
    </div>
  );
}
