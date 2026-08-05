import { Text } from "@react-email/components";
import { EmailLayout, buttonStyle, mutedStyle, textStyle } from "./EmailLayout";

export interface JobAlertEmailProps {
  learnerName: string;
  title: string;
  company: string;
  location: string;
  jobBoardUrl: string;
}

export function JobAlertEmail({ learnerName, title, company, location, jobBoardUrl }: JobAlertEmailProps) {
  return (
    <EmailLayout preview={`New opportunity: ${title} at ${company}`} heading="New job opportunity">
      <Text style={textStyle}>Hi {learnerName},</Text>
      <Text style={textStyle}>
        A new opportunity was just posted that matches your "open to work" status:
      </Text>
      <Text style={textStyle}>
        <strong>{title}</strong> at {company}
      </Text>
      <Text style={mutedStyle}>{location}</Text>
      <a href={jobBoardUrl} style={buttonStyle}>
        View on the job board
      </a>
    </EmailLayout>
  );
}
