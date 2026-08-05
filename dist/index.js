"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
// Patches Express so rejected promises in async route handlers are passed
// to the error middleware instead of hanging the request. Must be imported
// before any routers are defined.
require("express-async-errors");
const http_1 = require("http");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const db_1 = require("@novr/db");
const errors_1 = require("./lib/errors");
// Side-effect imports: starts the background workers in this same process.
require("./queues/certificateWorker");
require("./queues/emailWorker");
const alumni_1 = __importDefault(require("./routes/alumni"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const badges_1 = __importDefault(require("./routes/badges"));
const bulk_1 = __importDefault(require("./routes/bulk"));
const certificates_1 = __importDefault(require("./routes/certificates"));
const cohorts_1 = __importDefault(require("./routes/cohorts"));
const courses_1 = __importDefault(require("./routes/courses"));
const events_1 = __importDefault(require("./routes/events"));
const groups_1 = __importDefault(require("./routes/groups"));
const jobs_1 = __importDefault(require("./routes/jobs"));
const mentors_1 = __importDefault(require("./routes/mentors"));
const messages_1 = __importDefault(require("./routes/messages"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const posts_1 = __importDefault(require("./routes/posts"));
const reports_1 = __importDefault(require("./routes/reports"));
const users_1 = __importDefault(require("./routes/users"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const sockets_1 = require("./sockets");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
}));
app.use((0, cookie_parser_1.default)());
app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
// Webhook routes need the raw request body for signature verification, so
// they're mounted before the global JSON parser.
app.use("/webhooks", webhooks_1.default);
app.use(express_1.default.json());
app.use("/users", users_1.default);
app.use("/courses", courses_1.default);
app.use("/cohorts", cohorts_1.default);
app.use("/certificates", certificates_1.default);
app.use("/alumni", alumni_1.default);
app.use("/groups", groups_1.default);
app.use("/posts", posts_1.default);
app.use("/messages", messages_1.default);
app.use("/mentors", mentors_1.default);
app.use("/jobs", jobs_1.default);
app.use("/events", events_1.default);
app.use("/analytics", analytics_1.default);
app.use("/reports", reports_1.default);
app.use("/bulk", bulk_1.default);
app.use("/badges", badges_1.default);
app.use("/notifications", notifications_1.default);
app.use((err, _req, res, _next) => {
    if (err instanceof errors_1.ApiError) {
        return res.status(err.status).json({ error: err.message });
    }
    if (err instanceof db_1.Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return res.status(404).json({ error: "Not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});
const httpServer = (0, http_1.createServer)(app);
(0, sockets_1.createSocketServer)(httpServer);
const port = Number(process.env.API_PORT ?? 4000);
httpServer.listen(port, () => {
    console.log(`Novr Academy API listening on http://localhost:${port}`);
});
