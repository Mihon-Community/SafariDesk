import Login from "@/views/Login";
import { AuthLayout, AuthLink, AuthLinks } from "@/components/auth/AuthLayout";

export const metadata = { title: "Sign in — SafariDesk" };

export default function SignInPage() {
  return (
    <AuthLayout
      title="Run the safari from one dashboard"
      description="Bookings, dispatch, M-Pesa deposits and guest safety alerts — built for Kenyan tour operators."
    >
      <Login />
      <AuthLinks>
        No account yet? <AuthLink href="/sign-up">Create one</AuthLink>
      </AuthLinks>
    </AuthLayout>
  );
}
