import { Text } from "@react-email/components";
import { EmailLayout, buttonStyle, mutedStyle, textStyle } from "./EmailLayout";

export interface EnrollmentConfirmedEmailProps {
  learnerName: string;
  courseTitle: string;
  courseUrl: string;
  expiresAtLabel: string | null;
}

export function EnrollmentConfirmedEmail({
  learnerName,
  courseTitle,
  courseUrl,
  expiresAtLabel,
}: EnrollmentConfirmedEmailProps) {
  return (
    <EmailLayout preview={`You're enrolled in ${courseTitle}`} heading="You're enrolled!">
      <Text style={textStyle}>Hi {learnerName},</Text>
      <Text style={textStyle}>
        You're enrolled in <strong>{courseTitle}</strong>. You can start learning right away.
      </Text>
      {expiresAtLabel && <Text style={mutedStyle}>Access to this course is valid until {expiresAtLabel}.</Text>}
      <a href={courseUrl} style={buttonStyle}>
        Start learning
      </a>
    </EmailLayout>
  );
}
