import { Suspense } from "react";

import ResetPasswordForm from "@/views/ResetPasswordForm";
import { AuthLayout } from "@/components/auth/AuthLayout";

export const metadata = { title: "Reset password — SafariDesk" };

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Choose a new password"
      description="The link is single-use and expires after 30 minutes."
      image="/images/parks/tsavo-east-landscape.jpg"
      imageAlt="Red-dust landscape of Tsavo East"
    >
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
