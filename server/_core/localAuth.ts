import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; firstAttemptAt: number }>();

function secureEquals(left: string, right: string) {
  const leftValue = Buffer.from(left);
  const rightValue = Buffer.from(right);
  return leftValue.length === rightValue.length && timingSafeEqual(leftValue, rightValue);
}

function attemptKey(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function isBlocked(key: string) {
  const record = attempts.get(key);
  if (!record) return false;
  if (Date.now() - record.firstAttemptAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function registerFailure(key: string) {
  const current = attempts.get(key);
  if (!current || Date.now() - current.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: Date.now() });
    return;
  }
  attempts.set(key, { ...current, count: current.count + 1 });
}

export function isLocalAuthConfigured() {
  return Boolean(ENV.localAuthUsername && ENV.localAuthPassword && ENV.cookieSecret);
}

export function validateLocalCredentials(username: unknown, password: unknown) {
  if (!isLocalAuthConfigured() || typeof username !== "string" || typeof password !== "string") return false;
  return secureEquals(username.trim(), ENV.localAuthUsername) && secureEquals(password, ENV.localAuthPassword);
}

export function resetLocalAuthAttempts() {
  attempts.clear();
}

export function registerLocalAuthRoutes(app: Express) {
  app.post("/auth/local/login", async (req: Request, res: Response) => {
    if (!isLocalAuthConfigured()) {
      res.status(503).json({ error: "El acceso local no está configurado." });
      return;
    }

    const key = attemptKey(req);
    if (isBlocked(key)) {
      res.status(429).json({ error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo." });
      return;
    }

    const { username, password } = req.body as { username?: unknown; password?: unknown };
    if (!validateLocalCredentials(username, password)) {
      registerFailure(key);
      res.status(401).json({ error: "Usuario o contraseña incorrectos." });
      return;
    }

    attempts.delete(key);
    const displayName = ENV.localAuthUsername;
    const openId = `local:${ENV.localAuthUsername.toLowerCase()}`;
    await db.ensureLocalFinanceOwner(openId, displayName);

    const sessionToken = await sdk.createSessionToken(openId, { name: displayName, expiresInMs: ONE_YEAR_MS });
    res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
    res.status(200).json({ success: true, user: displayName });
  });
}
