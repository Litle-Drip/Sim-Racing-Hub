import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

if (!process.env.CORS_ORIGINS && process.env.NODE_ENV === "production") {
  throw new Error(
    "CORS_ORIGINS must be set in production — refusing to start with an open (reflect-any-origin) CORS policy.",
  );
}
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : undefined;

app.use(
  cors({
    credentials: true,
    origin: ALLOWED_ORIGINS ?? true,
  }),
);
app.use(helmet());
// Companion session uploads include per-lap speed/throttle/brake/steer
// traces (capped server-side at MAX_TRACE_SAMPLES per lap in
// routes/companion.ts's capTrace) which can run several MB for a
// multi-lap session — well over the default ceiling. That cap runs inside
// the route handler, downstream of this body parser, so an oversized
// request never reached it: express rejected the body outright with a 413
// before capTrace got a chance to trim it. Raised with headroom above the
// worst case (3000 samples/lap * a long race's lap count) so legitimate
// sessions aren't rejected before the server-side cap can even run. Scoped
// to just that route so every other endpoint keeps a small default ceiling.
const companionSessionJson = express.json({ limit: "20mb" });
const defaultJson = express.json({ limit: "1mb" });
app.use((req, res, next) => {
  if (req.path === "/api/companion/session") {
    return companionSessionJson(req, res, next);
  }
  return defaultJson(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

app.set("trust proxy", 1);

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
app.use("/api", limiter);

// On Replit, publishableKeyFromHost derives a key tied to the managed Clerk
// proxy for the current hostname. On external hosts (Render, etc.) that proxy
// doesn't exist, so we fall straight through to the env var key directly.
const REPLIT_HOST_SUFFIXES = [
  ".replit.app",
  ".replit.dev",
  ".repl.co",
  ".picard.replit.dev",
];

function resolveClerkKey(host: string): string | undefined {
  const isReplit = REPLIT_HOST_SUFFIXES.some((s) => host.endsWith(s));
  if (isReplit) {
    return publishableKeyFromHost(host, process.env.CLERK_PUBLISHABLE_KEY);
  }
  return process.env.CLERK_PUBLISHABLE_KEY;
}

app.use(
  clerkMiddleware((req) => ({
    publishableKey: resolveClerkKey(getClerkProxyHost(req) ?? ""),
    secretKey: process.env.CLERK_SECRET_KEY,
  })),
);

app.use("/api", router);

// Serve the compiled web app in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webAppDir = process.env.WEB_APP_DIR ||
  path.resolve(__dirname, "../../sim-racing-hq/dist/public");

if (existsSync(webAppDir)) {
  app.use(express.static(webAppDir));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(webAppDir, "index.html"));
  });
  logger.info({ webAppDir }, "Serving web app static files");
} else {
  logger.warn({ webAppDir }, "Web app build not found — API-only mode");
}

// Final safety net for errors thrown outside a route's own try/catch
// (e.g. malformed-JSON body-parser errors) so they never fall through to
// Express's default handler, which can leak stack traces.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log?.error({ err }, "Unhandled error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
