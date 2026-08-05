"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buttonStyle = exports.mutedStyle = exports.textStyle = void 0;
exports.EmailLayout = EmailLayout;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
function EmailLayout({ preview, heading, children, }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Head, {}), (0, jsx_runtime_1.jsx)(components_1.Preview, { children: preview }), (0, jsx_runtime_1.jsx)(components_1.Body, { style: { backgroundColor: "#F8F9FB", fontFamily: "Helvetica, Arial, sans-serif", padding: "24px 0" }, children: (0, jsx_runtime_1.jsxs)(components_1.Container, { style: {
                        backgroundColor: "#FFFFFF",
                        borderRadius: 8,
                        border: "1px solid #E5E7EB",
                        padding: "32px",
                        maxWidth: 480,
                    }, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { style: { fontSize: 12, color: "#6B7280", letterSpacing: 2, textTransform: "uppercase" }, children: "Novr Academy" }), (0, jsx_runtime_1.jsx)(components_1.Heading, { style: { fontSize: 20, color: "#111827", margin: "12px 0 16px" }, children: heading }), (0, jsx_runtime_1.jsx)(components_1.Section, { children: children })] }) })] }));
}
exports.textStyle = { fontSize: 15, color: "#111827", lineHeight: 1.6 };
exports.mutedStyle = { fontSize: 13, color: "#6B7280", lineHeight: 1.6 };
exports.buttonStyle = {
    display: "inline-block",
    backgroundColor: "#2563EB",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 600,
    padding: "10px 20px",
    borderRadius: 8,
    textDecoration: "none",
    marginTop: 16,
};
