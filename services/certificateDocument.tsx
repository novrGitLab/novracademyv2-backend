import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";

const NOVR_DEFAULT_COLOR = "#2563EB";
const NOVR_ACADEMY_NAME = "Novr Academy";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    fontFamily: "Helvetica",
  },
  border: {
    flex: 1,
    margin: 24,
    borderWidth: 3,
    borderStyle: "solid",
    padding: 32,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLogo: {
    width: 72,
    height: 36,
    objectFit: "contain",
  },
  headerLogoPlaceholder: {
    width: 72,
    height: 36,
  },
  headerTitle: {
    fontSize: 22,
    color: "#111827",
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  issuingAuthority: {
    fontSize: 9,
    color: "#6B7280",
    textAlign: "right",
  },
  body: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  certifyThat: {
    fontSize: 13,
    fontFamily: "Helvetica-Oblique",
    color: "#4B5563",
  },
  learnerName: {
    fontSize: 48,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginVertical: 16,
    textAlign: "center",
  },
  hasCompleted: {
    fontSize: 13,
    color: "#4B5563",
  },
  courseName: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginTop: 10,
    textAlign: "center",
    maxWidth: 560,
  },
  metaRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  metaBlock: {
    width: 160,
  },
  metaLabel: {
    fontSize: 8,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  metaValue: {
    marginTop: 3,
    fontSize: 11,
    color: "#374151",
  },
  metaValueMono: {
    marginTop: 3,
    fontSize: 10,
    fontFamily: "Courier",
    color: "#374151",
  },
  signatureLine: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#9CA3AF",
    paddingTop: 4,
    width: 160,
  },
  qr: {
    width: 56,
    height: 56,
  },
  bottomStrip: {
    marginTop: 20,
    marginHorizontal: -32,
    marginBottom: -32,
    paddingVertical: 10,
    paddingHorizontal: 32,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomStripText: {
    fontSize: 10,
    color: "#FFFFFF",
  },
  bottomStripSub: {
    fontSize: 8,
    color: "#FFFFFF",
    opacity: 0.85,
  },
});

export interface CertificateParams {
  learnerName: string;
  courseTitle: string;
  issuedAtLabel: string;
  certUid: string;
  verificationUrl: string;
  /** All org-specific values — pulled from the Tenant record at generation time (see certificateService.ts). Falls back to Novr Academy defaults when there's no tenant. */
  orgName?: string | null;
  orgLogoUrl?: string | null;
  orgPrimaryColor?: string | null;
}

async function toQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 200 });
}

// Not async — @react-pdf/renderer's reconciler doesn't support async
// components, so the QR code is rendered to a data URL up front by
// generateCertificatePdf() and passed in here as a plain prop.
function CertificateDocument({
  learnerName,
  courseTitle,
  issuedAtLabel,
  certUid,
  orgName,
  orgLogoUrl,
  orgPrimaryColor,
  qrDataUrl,
}: CertificateParams & { qrDataUrl: string }) {
  const color = orgPrimaryColor || NOVR_DEFAULT_COLOR;
  const issuedByOrg = Boolean(orgName);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={[styles.border, { borderColor: color }]}>
          <View style={styles.header}>
            {orgLogoUrl ? (
              <Image src={orgLogoUrl} style={styles.headerLogo} />
            ) : (
              <View style={styles.headerLogoPlaceholder} />
            )}
            <Text style={styles.headerTitle}>Certificate of Completion</Text>
            <Text style={styles.issuingAuthority}>Issued via{"\n"}Novr Academy</Text>
          </View>

          <View style={styles.body}>
            <Text style={styles.certifyThat}>This is to certify that</Text>
            <Text style={styles.learnerName}>{learnerName}</Text>
            <Text style={styles.hasCompleted}>has successfully completed</Text>
            <Text style={styles.courseName}>{courseTitle}</Text>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Date completed</Text>
              <Text style={styles.metaValue}>{issuedAtLabel}</Text>
            </View>

            <View style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <Text style={styles.metaLabel}>Certificate ID</Text>
              <Text style={styles.metaValueMono}>{certUid}</Text>
            </View>

            <Image src={qrDataUrl} style={styles.qr} />

            <View style={[styles.metaBlock, { alignItems: "flex-end" }]}>
              <View style={styles.signatureLine}>
                <Text style={styles.metaLabel}>{issuedByOrg ? `${orgName} Admin` : "Novr Academy"}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.bottomStrip, { backgroundColor: color }]}>
            <Text style={styles.bottomStripText}>{orgName ?? NOVR_ACADEMY_NAME}</Text>
            <Text style={styles.bottomStripSub}>
              {issuedByOrg ? `Powered by ${NOVR_ACADEMY_NAME}` : "novracademy.com"}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateCertificatePdf(params: CertificateParams): Promise<Buffer> {
  const qrDataUrl = await toQrDataUrl(params.verificationUrl);
  return renderToBuffer(<CertificateDocument {...params} qrDataUrl={qrDataUrl} />);
}
