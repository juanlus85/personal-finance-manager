import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import * as db from "./db";
import { registerLocalAuthRoutes, resetLocalAuthAttempts } from "./_core/localAuth";
import { sdk } from "./_core/sdk";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

vi.mock("./db", () => ({
  getLocalAccessStatus: vi.fn(),
  authenticateLocalAccess: vi.fn(),
  bootstrapLocalAccess: vi.fn(),
  listLocalAccessUsers: vi.fn(),
  createLocalAccessUser: vi.fn(),
  updateLocalAccessUser: vi.fn(),
}));
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: vi.fn() } }));
vi.mock("./_core/env", () => ({ ENV: { initialSetupToken: "setup-test-token" } }));

const persistedUser = {
  id: 1,
  openId: "local:juanlu",
  name: "Juanlu",
  email: null,
  loginMethod: "database",
  role: "admin" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

let closeServer: (() => Promise<void>) | null = null;

async function createAuthServer() {
  const app = express();
  app.use(express.json());
  registerLocalAuthRoutes(app);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  closeServer = () => new Promise<void>(resolve => server.close(() => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  await closeServer?.();
  closeServer = null;
  resetLocalAuthAttempts();
  vi.clearAllMocks();
});

describe("local authentication endpoint", () => {
  it("accepts a database-backed user and creates a session cookie", async () => {
    vi.mocked(db.getLocalAccessStatus).mockResolvedValue({ databaseAvailable: true, needsBootstrap: false });
    vi.mocked(db.authenticateLocalAccess).mockResolvedValue(persistedUser);
    vi.mocked(sdk.createSessionToken).mockResolvedValue("local-session-token");
    const baseUrl = await createAuthServer();

    const response = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Juanlu", password: "una-clave-segura" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, user: "Juanlu" });
    expect(db.authenticateLocalAccess).toHaveBeenCalledWith("Juanlu", "una-clave-segura");
    expect(response.headers.get("set-cookie")).toContain("session");
  });

  it("rejects an incorrect database password without setting a session cookie", async () => {
    vi.mocked(db.getLocalAccessStatus).mockResolvedValue({ databaseAvailable: true, needsBootstrap: false });
    vi.mocked(db.authenticateLocalAccess).mockResolvedValue(undefined);
    const baseUrl = await createAuthServer();

    const response = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Juanlu", password: "incorrecta" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("requires a first administrator account when no credentials exist", async () => {
    vi.mocked(db.getLocalAccessStatus).mockResolvedValue({ databaseAvailable: true, needsBootstrap: true });
    const baseUrl = await createAuthServer();

    const response = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Juanlu", password: "una-clave-segura" }),
    });

    expect(response.status).toBe(409);
    expect(db.authenticateLocalAccess).not.toHaveBeenCalled();
  });

  it("creates the first database-backed administrator from the protected bootstrap endpoint", async () => {
    vi.mocked(db.bootstrapLocalAccess).mockResolvedValue(persistedUser);
    vi.mocked(sdk.createSessionToken).mockResolvedValue("bootstrap-session-token");
    const baseUrl = await createAuthServer();

    const response = await fetch(`${baseUrl}/auth/local/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Juanlu", password: "una-clave-segura", displayName: "Juanlu Blanco", setupToken: "setup-test-token" }),
    });

    expect(response.status).toBe(200);
    expect(db.bootstrapLocalAccess).toHaveBeenCalledWith({ username: "Juanlu", password: "una-clave-segura", displayName: "Juanlu Blanco" });
    expect(response.headers.get("set-cookie")).toContain("session");
  });

  it("limits repeated failed login attempts", async () => {
    vi.mocked(db.getLocalAccessStatus).mockResolvedValue({ databaseAvailable: true, needsBootstrap: false });
    vi.mocked(db.authenticateLocalAccess).mockResolvedValue(undefined);
    const baseUrl = await createAuthServer();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(`${baseUrl}/auth/local/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "Juanlu", password: "incorrecta" }),
      });
      expect(response.status).toBe(401);
    }

    const blocked = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Juanlu", password: "incorrecta" }),
    });
    expect(blocked.status).toBe(429);
  });

  it("clears the session cookie when the local user signs out", async () => {
    const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
    const context: TrpcContext = {
      user: persistedUser,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: (name: string, options: Record<string, unknown>) => cleared.push({ name, options }) } as TrpcContext["res"],
    };

    const result = await appRouter.createCaller(context).auth.logout();

    expect(result).toEqual({ success: true });
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toMatchObject({ name: COOKIE_NAME, options: { maxAge: -1 } });
  });

  it("allows an administrator to manage database-backed access users", async () => {
    vi.mocked(db.listLocalAccessUsers).mockResolvedValue([{ id: 1, name: "Juanlu", role: "admin", username: "juanlu", isActive: true, lastSignedIn: new Date(), createdAt: new Date() }] as never);
    vi.mocked(db.createLocalAccessUser).mockResolvedValue({ id: 2, name: "Invitado", role: "user", username: "invitado", isActive: true });
    vi.mocked(db.updateLocalAccessUser).mockResolvedValue({ id: 2, username: "invitado", isActive: false });
    const context: TrpcContext = {
      user: persistedUser,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(context);

    await expect(caller.auth.users.list()).resolves.toHaveLength(1);
    await expect(caller.auth.users.create({ displayName: "Invitado", username: "invitado", password: "una-clave-segura", role: "user" })).resolves.toMatchObject({ username: "invitado", role: "user" });
    await expect(caller.auth.users.update({ id: 2, password: "otra-clave-segura", isActive: false })).resolves.toMatchObject({ id: 2, isActive: false });
    expect(db.createLocalAccessUser).toHaveBeenCalledWith({ displayName: "Invitado", username: "invitado", password: "una-clave-segura", role: "user" });
    expect(db.updateLocalAccessUser).toHaveBeenCalledWith(1, { userId: 2, password: "otra-clave-segura", isActive: false });
  });

  it("rejects an initial administrator creation without the installation token", async () => {
    const baseUrl = await createAuthServer();

    const response = await fetch(`${baseUrl}/auth/local/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Juanlu", password: "una-clave-segura", displayName: "Juanlu Blanco", setupToken: "incorrecto" }),
    });

    expect(response.status).toBe(403);
    expect(db.bootstrapLocalAccess).not.toHaveBeenCalled();
  });
});
