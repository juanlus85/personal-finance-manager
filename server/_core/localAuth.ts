import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { verifySecretValue } from "../auth/localPasswords";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; firstAttemptAt: number }>();

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
  return true;
}

export function resetLocalAuthAttempts() {
  attempts.clear();
}

export function registerLocalAuthRoutes(app: Express) {
  const createSession = async (req: Request, res: Response, user: { openId: string; name: string | null }) => {
    const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? "Usuario", expiresInMs: ONE_YEAR_MS });
    res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
    res.status(200).json({ success: true, user: user.name ?? "Usuario" });
  };

  app.get("/auth/local/status", async (_req, res) => {
    try {
      res.json({ ...(await db.getLocalAccessStatus()), bootstrapProtected: Boolean(ENV.initialSetupToken) });
    } catch {
      res.status(503).json({ error: "No se pudo comprobar el acceso local." });
    }
  });

  app.post("/auth/local/login", async (req: Request, res: Response) => {
    const key = attemptKey(req);
    if (isBlocked(key)) {
      res.status(429).json({ error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo." });
      return;
    }

    const { username, password } = req.body as { username?: unknown; password?: unknown };
    if (typeof username !== "string" || typeof password !== "string") {
      registerFailure(key);
      res.status(401).json({ error: "Usuario o contraseña incorrectos." });
      return;
    }
    try {
      const status = await db.getLocalAccessStatus();
      if (!status.databaseAvailable) {
        res.status(503).json({ error: "La base de datos no está disponible." });
        return;
      }
      if (status.needsBootstrap) {
        res.status(409).json({ error: "Crea primero el acceso inicial." });
        return;
      }
      const user = await db.authenticateLocalAccess(username, password);
      if (!user) {
        registerFailure(key);
        res.status(401).json({ error: "Usuario o contraseña incorrectos." });
        return;
      }
      attempts.delete(key);
      await createSession(req, res, user);
    } catch (error) {
      console.error("[LocalAuth] Login failed", error);
      res.status(500).json({ error: "No se pudo iniciar sesión." });
    }
  });

  app.post("/auth/local/bootstrap", async (req: Request, res: Response) => {
    const { username, password, displayName, setupToken } = req.body as { username?: unknown; password?: unknown; displayName?: unknown; setupToken?: unknown };
    if (typeof username !== "string" || !/^[a-zA-Z0-9._-]{3,80}$/.test(username) || typeof password !== "string" || password.length < 10 || typeof displayName !== "string" || displayName.trim().length < 2 || displayName.trim().length > 120) {
      res.status(400).json({ error: "Indica un nombre, un usuario válido y una contraseña de al menos 10 caracteres." });
      return;
    }
    if (!ENV.initialSetupToken || typeof setupToken !== "string" || !verifySecretValue(setupToken, ENV.initialSetupToken)) {
      res.status(403).json({ error: "El token de instalación no es válido." });
      return;
    }
    try {
      const user = await db.bootstrapLocalAccess({ username, password, displayName: displayName.trim() });
      await createSession(req, res, user);
    } catch (error) {
      if (error instanceof Error && error.message === "BOOTSTRAP_ALREADY_COMPLETED") {
        res.status(409).json({ error: "El acceso inicial ya está creado." });
        return;
      }
      console.error("[LocalAuth] Bootstrap failed", error);
      res.status(500).json({ error: "No se pudo crear el acceso inicial." });
    }
  });
}
