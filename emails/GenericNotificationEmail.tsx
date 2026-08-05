import { Text } from "@react-email/components";
import { EmailLayout, textStyle } from "./EmailLayout";

export interface GenericNotificationEmailProps {
  title: string;
  content: string;
}

export function GenericNotificationEmail({ title, content }: GenericNotificationEmailProps) {
  return (
    <EmailLayout preview={title} heading={title}>
      <Text style={textStyle}>{content}</Text>
    </EmailLayout>
  );
}
