"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCertificatePdf = generateCertificatePdf;
const jsx_runtime_1 = require("react/jsx-runtime");
const renderer_1 = require("@react-pdf/renderer");
const styles = renderer_1.StyleSheet.create({
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
function CertificateDocument({ learnerName, courseTitle, issuedAtLabel, certUid }) {
    return ((0, jsx_runtime_1.jsx)(renderer_1.Document, { children: (0, jsx_runtime_1.jsx)(renderer_1.Page, { size: "A4", orientation: "landscape", style: styles.page, children: (0, jsx_runtime_1.jsxs)(renderer_1.View, { style: styles.border, children: [(0, jsx_runtime_1.jsx)(renderer_1.Text, { style: styles.brand, children: "Novr Academy" }), (0, jsx_runtime_1.jsx)(renderer_1.Text, { style: styles.title, children: "Certificate of Completion" }), (0, jsx_runtime_1.jsx)(renderer_1.Text, { style: styles.subtitle, children: "This certifies that" }), (0, jsx_runtime_1.jsx)(renderer_1.Text, { style: styles.name, children: learnerName }), (0, jsx_runtime_1.jsx)(renderer_1.Text, { style: styles.subtitle, children: "has successfully completed" }), (0, jsx_runtime_1.jsx)(renderer_1.Text, { style: styles.course, children: courseTitle }), (0, jsx_runtime_1.jsxs)(renderer_1.Text, { style: styles.meta, children: ["Issued ", issuedAtLabel, " \u00B7 Certificate ID ", certUid] })] }) }) }));
}
function generateCertificatePdf(params) {
    return (0, renderer_1.renderToBuffer)((0, jsx_runtime_1.jsx)(CertificateDocument, { ...params }));
}
