import "dotenv/config";
// Patches Express so rejected promises in async route handlers are passed
// to the error middleware instead of hanging the request. Must be imported
// before any routers are defined.
import "express-async-errors";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { Prisma, PrismaClientKnownRequestError } from "@novr/db";
import { ApiError } from "./lib/errors";

import alumniRouter from "./routes/alumni";
import authRouter from "./routes/auth";
import analyticsRouter from "./routes/analytics";
import campaignsRouter from "./routes/campaigns";
import badgesRouter from "./routes/badges";
import bulkRouter from "./routes/bulk";
import certificatesRouter from "./routes/certificates";
import cohortsRouter from "./routes/cohorts";
import complianceRouter from "./routes/compliance";
import coursesRouter from "./routes/courses";
import eventsRouter from "./routes/events";
import groupsRouter from "./routes/groups";
import jobsRouter from "./routes/jobs";
import meRouter from "./routes/me";
import mentorsRouter from "./routes/mentors";
import messagesRouter from "./routes/messages";
import notificationsRouter from "./routes/notifications";
import organizationsRouter from "./routes/organizations";
import postsRouter from "./routes/posts";
import reportsRouter from "./routes/reports";
import usersRouter from "./routes/users";
import webhooksRouter from "./routes/webhooks";
import labsRouter from "./routes/labs";
import { startLabSessionCleanup } from "./services/labSessionCleanup";
import { createSocketServer } from "./sockets";

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With"],
  })
);
app.use(cookieParser());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString() })
);

// Webhook routes need the raw request body for signature verification, so
// they're mounted before the global JSON parser.
app.use("/webhooks", webhooksRouter);

// JSON parser with a raised limit so uploaded image data URLs (course
// thumbnails, org logos) fit in the request body.
app.use(express.json({ limit: "10mb" }));

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/courses", coursesRouter);
app.use("/cohorts", cohortsRouter);
app.use("/compliance", complianceRouter);
app.use("/certificates", certificatesRouter);
app.use("/alumni", alumniRouter);
app.use("/groups", groupsRouter);
app.use("/posts", postsRouter);
app.use("/messages", messagesRouter);
app.use("/me", meRouter);
app.use("/mentors", mentorsRouter);
app.use("/jobs", jobsRouter);
app.use("/events", eventsRouter);
app.use("/analytics", analyticsRouter);
app.use("/reports", reportsRouter);
app.use("/bulk", bulkRouter);
app.use("/badges", badgesRouter);
app.use("/notifications", notificationsRouter);
app.use("/organizations", organizationsRouter);
app.use("/campaigns", campaignsRouter);
app.use("/labs", labsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof PrismaClientKnownRequestError && err.code === "P2025") {
    return res.status(404).json({ error: "Not found" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const httpServer = createServer(app);
createSocketServer(httpServer);
startLabSessionCleanup();

const port = Number(process.env.API_PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`Novr Academy API listening on http://localhost:${port}`);
});
