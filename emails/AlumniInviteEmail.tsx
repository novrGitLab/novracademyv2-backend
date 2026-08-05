import { Text } from "@react-email/components";
import { EmailLayout, buttonStyle, mutedStyle, textStyle } from "./EmailLayout";

export interface AlumniInviteEmailProps {
  fullName: string;
  courseName: string;
  claimUrl: string;
}

export function AlumniInviteEmail({ fullName, courseName, claimUrl }: AlumniInviteEmailProps) {
  return (
    <EmailLayout preview="Your training record is on Novr Academy" heading="Claim your profile">
      <Text style={textStyle}>Hi {fullName},</Text>
      <Text style={textStyle}>
        Your training record for <strong>{courseName}</strong> is on Novr Academy — including a certificate
        that's ready as soon as you claim your profile.
      </Text>
      <Text style={mutedStyle}>Claiming takes less than a minute.</Text>
      <a href={claimUrl} style={buttonStyle}>
        Claim your profile
      </a>
    </EmailLayout>
  );
}
