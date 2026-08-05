"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpiryWarningEmail = ExpiryWarningEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const EmailLayout_1 = require("./EmailLayout");
function ExpiryWarningEmail({ learnerName, courseTitle, courseUrl, daysRemaining }) {
    const dayLabel = daysRemaining === 1 ? "1 day" : `${daysRemaining} days`;
    return ((0, jsx_runtime_1.jsxs)(EmailLayout_1.EmailLayout, { preview: `Your access to ${courseTitle} expires in ${dayLabel}`, heading: "Your access is expiring soon", children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["Hi ", learnerName, ","] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["Your access to ", (0, jsx_runtime_1.jsx)("strong", { children: courseTitle }), " expires in ", (0, jsx_runtime_1.jsx)("strong", { children: dayLabel }), ". Finish up, or re-enroll to keep your progress going."] }), (0, jsx_runtime_1.jsx)("a", { href: courseUrl, style: EmailLayout_1.buttonStyle, children: "Continue course" })] }));
}
