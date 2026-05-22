import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

export interface AuthRequest extends Request {
  userId: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  let auth;
  try {
    auth = getAuth(req);
  } catch (err) {
    req.log.error({ err }, "Clerk getAuth failed");
    res.status(401).json({ error: "Authentication unavailable" });
    return;
  }
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthRequest).userId = userId;
  next();
}
