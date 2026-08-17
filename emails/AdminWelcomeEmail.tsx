import { Text } from "@react-email/components";
import { EmailLayout, buttonStyle, textStyle } from "./EmailLayout";

export interface AdminWelcomeEmailProps {
  orgName: string;
  adminName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
}

export function AdminWelcomeEmail({ orgName, adminName, email, tempPassword, loginUrl }: AdminWelcomeEmailProps) {
  return (
    <EmailLayout preview={`Your ${orgName} account is ready`} heading={`Welcome, ${adminName}`}>
      <Text style={textStyle}>
        Your organization <strong>{orgName}</strong> has been set up on Novr Academy. Here are
        your sign-in credentials:
      </Text>
      <Text style={textStyle}>
        Email: <strong>{email}</strong>
        <br />
        Temporary password: <strong>{tempPassword}</strong>
      </Text>
      <Text style={textStyle}>
        You&apos;ll be asked to upload your organization&apos;s logo on first sign-in so we can
        apply your brand colors. Please change your password after signing in.
      </Text>
      <a href={loginUrl} style={buttonStyle}>
        Sign in to Novr Academy
      </a>
    </EmailLayout>
  );
}
