"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenericNotificationEmail = GenericNotificationEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const EmailLayout_1 = require("./EmailLayout");
function GenericNotificationEmail({ title, content }) {
    return ((0, jsx_runtime_1.jsx)(EmailLayout_1.EmailLayout, { preview: title, heading: title, children: (0, jsx_runtime_1.jsx)(components_1.Text, { style: EmailLayout_1.textStyle, children: content }) }));
}
