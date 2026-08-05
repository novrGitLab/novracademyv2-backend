"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobAlertEmail = JobAlertEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const EmailLayout_1 = require("./EmailLayout");
function JobAlertEmail({ learnerName, title, company, location, jobBoardUrl }) {
    return ((0, jsx_runtime_1.jsxs)(EmailLayout_1.EmailLayout, { preview: `New opportunity: ${title} at ${company}`, heading: "New job opportunity", children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["Hi ", learnerName, ","] }), (0, jsx_runtime_1.jsx)(components_1.Text, { style: EmailLayout_1.textStyle, children: "A new opportunity was just posted that matches your \"open to work\" status:" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: [(0, jsx_runtime_1.jsx)("strong", { children: title }), " at ", company] }), (0, jsx_runtime_1.jsx)(components_1.Text, { style: EmailLayout_1.mutedStyle, children: location }), (0, jsx_runtime_1.jsx)("a", { href: jobBoardUrl, style: EmailLayout_1.buttonStyle, children: "View on the job board" })] }));
}
