import { Text } from "@react-email/components";
import { EmailLayout, buttonStyle, mutedStyle, textStyle } from "./EmailLayout";

export interface QuizResultEmailProps {
  learnerName: string;
  courseTitle: string;
  lessonTitle: string;
  courseUrl: string;
  score: number;
  passed: boolean;
  attemptsRemaining: number;
}

export function QuizResultEmail({
  learnerName,
  courseTitle,
  lessonTitle,
  courseUrl,
  score,
  passed,
  attemptsRemaining,
}: QuizResultEmailProps) {
  return (
    <EmailLayout preview={`Quiz result: ${passed ? "Passed" : "Not passed"}`} heading={passed ? "You passed! 🎉" : "Quiz result"}>
      <Text style={textStyle}>Hi {learnerName},</Text>
      <Text style={textStyle}>
        You scored <strong>{Math.round(score)}%</strong> on <strong>{lessonTitle}</strong> ({courseTitle}).
      </Text>
      {!passed && (
        <Text style={mutedStyle}>
          {attemptsRemaining > 0
            ? `You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`
            : "You've used all your attempts for this quiz."}
        </Text>
      )}
      <a href={courseUrl} style={buttonStyle}>
        {passed ? "Continue course" : "Try again"}
      </a>
    </EmailLayout>
  );
}
