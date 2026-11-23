import { Suspense } from "react";

import ResetPasswordForm from "@/views/ResetPasswordForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Reset password — SafariDesk" };

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">Choose a new password</CardTitle>
          <CardDescription>Your new password applies immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
