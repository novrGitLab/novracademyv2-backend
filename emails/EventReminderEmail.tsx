import { Text } from "@react-email/components";
import { EmailLayout, buttonStyle, textStyle } from "./EmailLayout";

export interface EventReminderEmailProps {
  learnerName: string;
  eventTitle: string;
  startAtLabel: string;
  eventUrl: string;
  hoursBefore: number;
}

export function EventReminderEmail({ learnerName, eventTitle, startAtLabel, eventUrl, hoursBefore }: EventReminderEmailProps) {
  const when = hoursBefore >= 24 ? "tomorrow" : "in about an hour";
  return (
    <EmailLayout preview={`${eventTitle} starts ${when}`} heading="Event reminder">
      <Text style={textStyle}>Hi {learnerName},</Text>
      <Text style={textStyle}>
        <strong>{eventTitle}</strong> starts {when} — {startAtLabel}.
      </Text>
      <a href={eventUrl} style={buttonStyle}>
        View event
      </a>
    </EmailLayout>
  );
}
