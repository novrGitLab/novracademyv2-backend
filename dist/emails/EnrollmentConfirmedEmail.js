"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnrollmentConfirmedEmail = EnrollmentConfirmedEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const EmailLayout_1 = require("./EmailLayout");
function EnrollmentConfirmedEmail({ learnerName, courseTitle, courseUrl, expiresAtLabel, }) {
    return ((0, jsx_runtime_1.jsxs)(EmailLayout_1.EmailLayout, { preview: `You're enrolled in ${courseTitle}`, heading: "You're enrolled!", children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["Hi ", learnerName, ","] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["You're enrolled in ", (0, jsx_runtime_1.jsx)("strong", { children: courseTitle }), ". You can start learning right away."] }), expiresAtLabel && (0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.mutedStyle, children: ["Access to this course is valid until ", expiresAtLabel, "."] }), (0, jsx_runtime_1.jsx)("a", { href: courseUrl, style: EmailLayout_1.buttonStyle, children: "Start learning" })] }));
}
