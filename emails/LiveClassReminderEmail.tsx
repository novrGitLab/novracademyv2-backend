import { Text } from "@react-email/components";
import { EmailLayout, buttonStyle, textStyle } from "./EmailLayout";

export interface LiveClassReminderEmailProps {
  learnerName: string;
  lessonTitle: string;
  courseTitle: string;
  courseUrl: string;
  scheduledAtLabel: string;
  hoursBefore: number;
}

export function LiveClassReminderEmail({
  learnerName,
  lessonTitle,
  courseTitle,
  courseUrl,
  scheduledAtLabel,
  hoursBefore,
}: LiveClassReminderEmailProps) {
  const when = hoursBefore >= 24 ? "tomorrow" : "in about an hour";
  return (
    <EmailLayout preview={`${lessonTitle} starts ${when}`} heading="Live class reminder">
      <Text style={textStyle}>Hi {learnerName},</Text>
      <Text style={textStyle}>
        <strong>{lessonTitle}</strong> ({courseTitle}) starts {when} — {scheduledAtLabel}.
      </Text>
      <a href={courseUrl} style={buttonStyle}>
        View class
      </a>
    </EmailLayout>
  );
}
