import { Suspense } from "react";
import { NewPasswordForm } from "@/components/new-password-form";

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
