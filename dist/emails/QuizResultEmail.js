"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuizResultEmail = QuizResultEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const EmailLayout_1 = require("./EmailLayout");
function QuizResultEmail({ learnerName, courseTitle, lessonTitle, courseUrl, score, passed, attemptsRemaining, }) {
    return ((0, jsx_runtime_1.jsxs)(EmailLayout_1.EmailLayout, { preview: `Quiz result: ${passed ? "Passed" : "Not passed"}`, heading: passed ? "You passed! 🎉" : "Quiz result", children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["Hi ", learnerName, ","] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: EmailLayout_1.textStyle, children: ["You scored ", (0, jsx_runtime_1.jsxs)("strong", { children: [Math.round(score), "%"] }), " on ", (0, jsx_runtime_1.jsx)("strong", { children: lessonTitle }), " (", courseTitle, ")."] }), !passed && ((0, jsx_runtime_1.jsx)(components_1.Text, { style: EmailLayout_1.mutedStyle, children: attemptsRemaining > 0
                    ? `You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`
                    : "You've used all your attempts for this quiz." })), (0, jsx_runtime_1.jsx)("a", { href: courseUrl, style: EmailLayout_1.buttonStyle, children: passed ? "Continue course" : "Try again" })] }));
}
