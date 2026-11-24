import { Suspense } from "react";

import ForgotPasswordForm from "@/views/ForgotPasswordForm";
import { AuthLayout } from "@/components/auth/AuthLayout";

export const metadata = { title: "Forgot password — SafariDesk" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      description="We will send a single-use, time-limited link to your email or phone."
      image="/images/parks/lake-nakuru-flamingos.jpg"
      imageAlt="Flamingos gathered on Lake Nakuru"
    >
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
