"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CertificateIssuedEmail = CertificateIssuedEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const EmailLayout_1 = require("./EmailLayout");
function CertificateIssuedEmail({ learnerName, courseTitle, verificationUrl }) {
    return ((0, jsx_runtime_1.jsxs)(EmailLayout_1.EmailLayout, { preview: `Your certificate for ${courseTitle} is ready`, heading: "Certificate earned \uD83C\uDF93", children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["Hi ", learnerName, ","] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["Congratulations on completing ", (0, jsx_runtime_1.jsx)("strong", { children: courseTitle }), "! Your certificate is ready to view and share."] }), (0, jsx_runtime_1.jsx)("a", { href: verificationUrl, style: EmailLayout_1.buttonStyle, children: "View certificate" })] }));
}
