"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlumniInviteEmail = AlumniInviteEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const EmailLayout_1 = require("./EmailLayout");
function AlumniInviteEmail({ fullName, courseName, claimUrl }) {
    return ((0, jsx_runtime_1.jsxs)(EmailLayout_1.EmailLayout, { preview: "Your training record is on Novr Academy", heading: "Claim your profile", children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["Hi ", fullName, ","] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["Your training record for ", (0, jsx_runtime_1.jsx)("strong", { children: courseName }), " is on Novr Academy \u2014 including a certificate that's ready as soon as you claim your profile."] }), (0, jsx_runtime_1.jsx)(components_1.Text, { style: EmailLayout_1.mutedStyle, children: "Claiming takes less than a minute." }), (0, jsx_runtime_1.jsx)("a", { href: claimUrl, style: EmailLayout_1.buttonStyle, children: "Claim your profile" })] }));
}
