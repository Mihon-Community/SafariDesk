import { Suspense } from "react";

import SignUpForm from "@/views/SignUpForm";
import { AuthLayout } from "@/components/auth/AuthLayout";

export const metadata = { title: "Create account — SafariDesk" };

export default function SignUpPage() {
  return (
    <AuthLayout
      title="Book your next Kenyan safari"
      description="Create a customer account to request quotes, track trips and pay deposits by M-Pesa."
      image="/images/parks/amboseli-elephants-kilimanjaro.jpg"
      imageAlt="Elephants walking towards Mount Kilimanjaro in Amboseli"
    >
      <Suspense fallback={null}>
        <SignUpForm />
      </Suspense>
    </AuthLayout>
  );
}
