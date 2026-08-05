import { Text } from "@react-email/components";
import { EmailLayout, buttonStyle, textStyle } from "./EmailLayout";

export interface CertificateIssuedEmailProps {
  learnerName: string;
  courseTitle: string;
  verificationUrl: string;
}

export function CertificateIssuedEmail({ learnerName, courseTitle, verificationUrl }: CertificateIssuedEmailProps) {
  return (
    <EmailLayout preview={`Your certificate for ${courseTitle} is ready`} heading="Certificate earned 🎓">
      <Text style={textStyle}>Hi {learnerName},</Text>
      <Text style={textStyle}>
        Congratulations on completing <strong>{courseTitle}</strong>! Your certificate is ready to view and share.
      </Text>
      <a href={verificationUrl} style={buttonStyle}>
        View certificate
      </a>
    </EmailLayout>
  );
}
