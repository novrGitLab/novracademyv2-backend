import "dotenv/config";
// Patches Express so rejected promises in async route handlers are passed
// to the error middleware instead of hanging the request. Must be imported
// before any routers are defined.
import "express-async-errors";
import helmet from "helmet";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { Prisma, PrismaClientKnownRequestError } from "@novr/db";
import { isDemoMode } from "./lib/demoMode";
import { ApiError } from "./lib/errors";

import alumniRouter from "./routes/alumni";
import assessmentsRouter from "./routes/assessments";
import authRouter from "./routes/auth";
import oauthRouter from "./routes/oauth";
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
import gamificationRouter from "./routes/gamification";
import groupsRouter from "./routes/groups";
import itfRouter from "./routes/itf";
import jobsRouter from "./routes/jobs";
import labsRouter from "./routes/labs";
import marketingCampaignsRouter from "./routes/marketingCampaigns";
import meRouter from "./routes/me";
import mentorsRouter from "./routes/mentors";
import bootcampsRouter from "./routes/bootcamps";
import socFeedRouter from "./routes/socFeed";
import postsRouter from "./routes/posts";
import messagesRouter from "./routes/messages";
import newsletterRouter from "./routes/newsletter";
import notificationsRouter from "./routes/notifications";
import organizationsRouter from "./routes/organizations";
import reportsRouter from "./routes/reports";
import sendingProfilesRouter from "./routes/sendingProfiles";
import storageRouter from "./routes/storage";
import usersRouter from "./routes/users";
import webhooksRouter from "./routes/webhooks";
import { createSocketServer } from "./sockets";
import { runWorkerLoop } from "./services/jobQueue";

const app = express();

app.set("trust proxy", 1);

// Standard security headers (HSTS handled by Railway/Vercel in front, but
// X-Frame-Options, X-Content-Type-Options, etc. come from Helmet).
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());
// Local dev servers that hit this backend directly.
allowedOrigins.push("http://localhost:3000", "http://localhost:3001", "http://localhost:3011", "http://localhost:3012", "http://localhost:3013");

// Allow only the configured frontend origin(s) to call the API with
// credentials. Disallowed origins simply get no Access-Control-Allow-Origin
// header — the browser then blocks the request client-side while the API
// still answers non-browser clients (curl, server-to-server).
app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients send no Origin header — allow them.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With"],
  })
);
app.use(cookieParser());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString(), demoMode: isDemoMode() })
);

// Webhook routes need the raw request body for signature verification, so
// they're mounted before the global JSON parser.
app.use("/webhooks", webhooksRouter);

// JSON parser with a raised limit so uploaded image data URLs (course
// thumbnails, org logos) fit in the request body.
app.use(express.json({ limit: "10mb" }));

app.use("/auth", authRouter);
app.use("/oauth", oauthRouter);
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
app.use("/bootcamps", bootcampsRouter);
app.use("/soc-feed", socFeedRouter);
app.use("/jobs", jobsRouter);
app.use("/events", eventsRouter);
app.use("/analytics", analyticsRouter);
app.use("/reports", reportsRouter);
app.use("/bulk", bulkRouter);
app.use("/badges", badgesRouter);
app.use("/notifications", notificationsRouter);
app.use("/organizations", organizationsRouter);
app.use("/campaigns", campaignsRouter);
app.use("/newsletter", newsletterRouter);
app.use("/marketing-campaigns", marketingCampaignsRouter);
app.use("/assessments", assessmentsRouter);
app.use("/storage", storageRouter);
app.use("/enrollment-codes", enrollmentCodesRouter);
app.use("/enrollments", enrollmentRedeemRouter);
app.use("/itf", itfRouter);
app.use("/labs", labsRouter);
app.use("/gamification", gamificationRouter);
app.use("/sending-profiles", sendingProfilesRouter);

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
  // Start the job queue worker (Postgres-backed, claims due jobs every 2s).
  console.log("[queue] starting worker loop...");
  runWorkerLoop();
});

// Connection hygiene: keep-alive sockets idle longer than the LB/proxy
// (Railway/Vercel keep ~60s) would otherwise be killed mid-request; aligning
// this just above the upstream idle timeout lets the server close them
// cleanly and avoids ECONNRESET churn. headersTimeout must exceed
// keepAliveTimeout so a slow client can't hold a socket past the headers
// window and get an unexpected reset.
httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout = 70_000;
