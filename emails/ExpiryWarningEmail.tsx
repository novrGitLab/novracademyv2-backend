import { Text } from "@react-email/components";
import { EmailLayout, buttonStyle, textStyle } from "./EmailLayout";

export interface ExpiryWarningEmailProps {
  learnerName: string;
  courseTitle: string;
  courseUrl: string;
  daysRemaining: number;
}

export function ExpiryWarningEmail({ learnerName, courseTitle, courseUrl, daysRemaining }: ExpiryWarningEmailProps) {
  const dayLabel = daysRemaining === 1 ? "1 day" : `${daysRemaining} days`;
  return (
    <EmailLayout preview={`Your access to ${courseTitle} expires in ${dayLabel}`} heading="Your access is expiring soon">
      <Text style={textStyle}>Hi {learnerName},</Text>
      <Text style={textStyle}>
        Your access to <strong>{courseTitle}</strong> expires in <strong>{dayLabel}</strong>. Finish up, or
        re-enroll to keep your progress going.
      </Text>
      <a href={courseUrl} style={buttonStyle}>
        Continue course
      </a>
    </EmailLayout>
  );
}
