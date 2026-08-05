"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveClassReminderEmail = LiveClassReminderEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const EmailLayout_1 = require("./EmailLayout");
function LiveClassReminderEmail({ learnerName, lessonTitle, courseTitle, courseUrl, scheduledAtLabel, hoursBefore, }) {
    const when = hoursBefore >= 24 ? "tomorrow" : "in about an hour";
    return ((0, jsx_runtime_1.jsxs)(EmailLayout_1.EmailLayout, { preview: `${lessonTitle} starts ${when}`, heading: "Live class reminder", children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["Hi ", learnerName, ","] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: [(0, jsx_runtime_1.jsx)("strong", { children: lessonTitle }), " (", courseTitle, ") starts ", when, " \u2014 ", scheduledAtLabel, "."] }), (0, jsx_runtime_1.jsx)("a", { href: courseUrl, style: EmailLayout_1.buttonStyle, children: "View class" })] }));
}
