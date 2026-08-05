"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventReminderEmail = EventReminderEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const EmailLayout_1 = require("./EmailLayout");
function EventReminderEmail({ learnerName, eventTitle, startAtLabel, eventUrl, hoursBefore }) {
    const when = hoursBefore >= 24 ? "tomorrow" : "in about an hour";
    return ((0, jsx_runtime_1.jsxs)(EmailLayout_1.EmailLayout, { preview: `${eventTitle} starts ${when}`, heading: "Event reminder", children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["Hi ", learnerName, ","] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: [(0, jsx_runtime_1.jsx)("strong", { children: eventTitle }), " starts ", when, " \u2014 ", startAtLabel, "."] }), (0, jsx_runtime_1.jsx)("a", { href: eventUrl, style: EmailLayout_1.buttonStyle, children: "View event" })] }));
}
