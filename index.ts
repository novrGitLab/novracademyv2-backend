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
// Side-effect imports: starts the background workers in this same process.
import "./queues/certificateWorker";
import "./queues/emailWorker";
import alumniRouter from "./routes/alumni";
import analyticsRouter from "./routes/analytics";
import badgesRouter from "./routes/badges";
import bulkRouter from "./routes/bulk";
import certificatesRouter from "./routes/certificates";
import cohortsRouter from "./routes/cohorts";
import coursesRouter from "./routes/courses";
import eventsRouter from "./routes/events";
import groupsRouter from "./routes/groups";
import jobsRouter from "./routes/jobs";
import mentorsRouter from "./routes/mentors";
import messagesRouter from "./routes/messages";
import notificationsRouter from "./routes/notifications";
import postsRouter from "./routes/posts";
import reportsRouter from "./routes/reports";
import usersRouter from "./routes/users";
import webhooksRouter from "./routes/webhooks";
import { createSocketServer } from "./sockets";

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);
app.use(cookieParser());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString() })
);

// Webhook routes need the raw request body for signature verification, so
// they're mounted before the global JSON parser.
app.use("/webhooks", webhooksRouter);

app.use(express.json());

app.use("/users", usersRouter);
app.use("/courses", coursesRouter);
app.use("/cohorts", cohortsRouter);
app.use("/certificates", certificatesRouter);
app.use("/alumni", alumniRouter);
app.use("/groups", groupsRouter);
app.use("/posts", postsRouter);
app.use("/messages", messagesRouter);
app.use("/mentors", mentorsRouter);
app.use("/jobs", jobsRouter);
app.use("/events", eventsRouter);
app.use("/analytics", analyticsRouter);
app.use("/reports", reportsRouter);
app.use("/bulk", bulkRouter);
app.use("/badges", badgesRouter);
app.use("/notifications", notificationsRouter);

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

const port = Number(process.env.API_PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`Novr Academy API listening on http://localhost:${port}`);
});
