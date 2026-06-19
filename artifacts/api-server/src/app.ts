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
app.use(express.json({ limit: "1mb" }));
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

export default app;
