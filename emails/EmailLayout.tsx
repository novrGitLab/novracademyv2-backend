import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";

export function EmailLayout({
  preview,
  heading,
  children,
}: {
  preview: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#F8F9FB", fontFamily: "Helvetica, Arial, sans-serif", padding: "24px 0" }}>
        <Container
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 8,
            border: "1px solid #E5E7EB",
            padding: "32px",
            maxWidth: 480,
          }}
        >
          <Text style={{ fontSize: 12, color: "#6B7280", letterSpacing: 2, textTransform: "uppercase" }}>
            Novr Academy
          </Text>
          <Heading style={{ fontSize: 20, color: "#111827", margin: "12px 0 16px" }}>{heading}</Heading>
          <Section>{children}</Section>
        </Container>
      </Body>
    </Html>
  );
}

export const textStyle = { fontSize: 15, color: "#111827", lineHeight: 1.6 };
export const mutedStyle = { fontSize: 13, color: "#6B7280", lineHeight: 1.6 };
export const buttonStyle = {
  display: "inline-block",
  backgroundColor: "#2563EB",
  color: "#FFFFFF",
  fontSize: 15,
  fontWeight: 600,
  padding: "10px 20px",
  borderRadius: 8,
  textDecoration: "none",
  marginTop: 16,
};
