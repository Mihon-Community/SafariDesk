import AcceptInviteForm from "@/views/AcceptInviteForm";
import { AuthLayout } from "@/components/auth/AuthLayout";

export const metadata = { title: "Accept invite — SafariDesk" };

export default function AcceptInvitePage() {
  return (
    <AuthLayout
      title="Join your SafariDesk team"
      description="Set your name and password to activate your staff account."
      image="/images/parks/tsavo-east-landscape.jpg"
      imageAlt="Red-dust landscape of Tsavo East"
    >
      <AcceptInviteForm />
    </AuthLayout>
  );
}
