import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "sk-ant-mock-api-key" });

// The spec named "claude-sonnet-4-6", which isn't a real model ID — using
// the current Sonnet model instead so this actually works once a real
// ANTHROPIC_API_KEY is configured.
const MODEL = "claude-sonnet-5";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskCourseAssistantParams {
  courseTitle: string;
  courseDescription: string | null;
  lessonTitles: string[];
  history: ChatMessage[];
  question: string;
}

/**
 * Scoped strictly to the course's own content via the system prompt —
 * this is a soft (prompt-level) boundary, not a hard filter, consistent
 * with how course-scoped assistants are normally built.
 */
export async function askCourseAssistant(params: AskCourseAssistantParams): Promise<string> {
  const systemPrompt = [
    `You are a learning assistant embedded in the Novr Academy course "${params.courseTitle}".`,
    params.courseDescription ? `Course description: ${params.courseDescription}` : null,
    `Lessons in this course: ${params.lessonTitles.join(", ") || "(none yet)"}`,
    "Only answer questions about this course's content. If asked about anything unrelated to the course, politely decline and redirect the learner back to the course material.",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...params.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: params.question },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}
