import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    backgroundColor: "#FFFFFF",
    fontFamily: "Helvetica",
  },
  border: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#2563EB",
    borderStyle: "solid",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  brand: {
    fontSize: 12,
    color: "#6B7280",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    color: "#111827",
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 6,
  },
  name: {
    fontSize: 30,
    color: "#2563EB",
    marginVertical: 14,
  },
  course: {
    fontSize: 17,
    color: "#111827",
    marginBottom: 28,
    textAlign: "center",
  },
  meta: {
    fontSize: 9,
    color: "#6B7280",
    marginTop: 36,
  },
});

export interface CertificateParams {
  learnerName: string;
  courseTitle: string;
  issuedAtLabel: string;
  certUid: string;
}

function CertificateDocument({ learnerName, courseTitle, issuedAtLabel, certUid }: CertificateParams) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.border}>
          <Text style={styles.brand}>Novr Academy</Text>
          <Text style={styles.title}>Certificate of Completion</Text>
          <Text style={styles.subtitle}>This certifies that</Text>
          <Text style={styles.name}>{learnerName}</Text>
          <Text style={styles.subtitle}>has successfully completed</Text>
          <Text style={styles.course}>{courseTitle}</Text>
          <Text style={styles.meta}>
            Issued {issuedAtLabel} · Certificate ID {certUid}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export function generateCertificatePdf(params: CertificateParams): Promise<Buffer> {
  return renderToBuffer(<CertificateDocument {...params} />);
}
