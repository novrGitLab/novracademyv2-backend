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
import { isDemoMode } from "./lib/demoMode";
import { ApiError } from "./lib/errors";
import { resolveTenant } from "./middleware/tenant";
// Side-effect imports: starts the background workers in this same process.
import "./queues/certificateWorker";
import "./queues/emailWorker";
import alumniRouter from "./routes/alumni";
import assessmentsRouter from "./routes/assessments";
import authRouter from "./routes/auth";
import analyticsRouter from "./routes/analytics";
import campaignsRouter from "./routes/campaigns";
import badgesRouter from "./routes/badges";
import bulkRouter from "./routes/bulk";
import certificatesRouter from "./routes/certificates";
import cohortsRouter from "./routes/cohorts";
import complianceRouter from "./routes/compliance";
import coursesRouter from "./routes/courses";
import enrollmentCodesRouter from "./routes/enrollmentCodes";
import enrollmentRedeemRouter from "./routes/enrollmentRedeem";
import eventsRouter from "./routes/events";
import groupsRouter from "./routes/groups";
import jobsRouter from "./routes/jobs";
import marketingCampaignsRouter from "./routes/marketingCampaigns";
import mentorsRouter from "./routes/mentors";
import messagesRouter from "./routes/messages";
import newsletterRouter from "./routes/newsletter";
import notificationsRouter from "./routes/notifications";
import postsRouter from "./routes/posts";
import reportsRouter from "./routes/reports";
import storageRouter from "./routes/storage";
import tenantsRouter from "./routes/tenants";
import usersRouter from "./routes/users";
import webhooksRouter from "./routes/webhooks";
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
// Resolves the tenant from the request's subdomain (e.g. acme.novracademy.com)
// and attaches it to req.tenant. Never blocks the request — see middleware/tenant.ts.
app.use(resolveTenant);

app.get("/health", (_req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString(), demoMode: isDemoMode() })
);

// Webhook routes need the raw request body for signature verification, so
// they're mounted before the global JSON parser.
app.use("/webhooks", webhooksRouter);

app.use(express.json());

app.use("/auth", authRouter);
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
app.use("/campaigns", campaignsRouter);
app.use("/tenants", tenantsRouter);
app.use("/compliance", complianceRouter);
app.use("/newsletter", newsletterRouter);
app.use("/marketing-campaigns", marketingCampaignsRouter);
app.use("/assessments", assessmentsRouter);
app.use("/storage", storageRouter);
app.use("/enrollment-codes", enrollmentCodesRouter);
app.use("/enrollments", enrollmentRedeemRouter);

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
