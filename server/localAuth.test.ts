import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import * as db from "./db";
import { registerLocalAuthRoutes, resetLocalAuthAttempts } from "./_core/localAuth";
import { sdk } from "./_core/sdk";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

vi.mock("./db", () => ({ upsertUser: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: vi.fn() } }));

let closeServer: (() => Promise<void>) | null = null;

afterEach(async () => {
  await closeServer?.();
  closeServer = null;
  resetLocalAuthAttempts();
  vi.clearAllMocks();
});

describe("local authentication endpoint", () => {
  it("accepts the configured local credentials and creates a session cookie", async () => {
    vi.mocked(db.upsertUser).mockResolvedValue(undefined);
    vi.mocked(sdk.createSessionToken).mockResolvedValue("local-session-token");

    const app = express();
    app.use(express.json());
    registerLocalAuthRoutes(app);
    const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    closeServer = () => new Promise<void>(resolve => server.close(() => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/auth/local/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: process.env.LOCAL_AUTH_USERNAME,
        password: process.env.LOCAL_AUTH_PASSWORD,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, user: process.env.LOCAL_AUTH_USERNAME });
    expect(db.upsertUser).toHaveBeenCalledWith(expect.objectContaining({ loginMethod: "local" }));
    expect(response.headers.get("set-cookie")).toContain("session");
  });

  it("rejects a wrong password without setting a session cookie", async () => {
    const app = express();
    app.use(express.json());
    registerLocalAuthRoutes(app);
    const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    closeServer = () => new Promise<void>(resolve => server.close(() => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/auth/local/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: process.env.LOCAL_AUTH_USERNAME, password: "invalid-password" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(db.upsertUser).not.toHaveBeenCalled();
  });

  it("limits repeated failed login attempts", async () => {
    const app = express();
    app.use(express.json());
    registerLocalAuthRoutes(app);
    const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    closeServer = () => new Promise<void>(resolve => server.close(() => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/auth/local/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: process.env.LOCAL_AUTH_USERNAME, password: "invalid-password" }),
      });
      expect(response.status).toBe(401);
    }

    const blocked = await fetch(`http://127.0.0.1:${port}/auth/local/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: process.env.LOCAL_AUTH_USERNAME, password: "invalid-password" }),
    });
    expect(blocked.status).toBe(429);
  });

  it("clears the session cookie when the local user signs out", async () => {
    const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
    const context: TrpcContext = {
      user: {
        id: 1,
        openId: `local:${process.env.LOCAL_AUTH_USERNAME?.toLowerCase()}`,
        name: process.env.LOCAL_AUTH_USERNAME ?? "Juanlu",
        email: null,
        loginMethod: "local",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: (name: string, options: Record<string, unknown>) => cleared.push({ name, options }) } as TrpcContext["res"],
    };

    const result = await appRouter.createCaller(context).auth.logout();

    expect(result).toEqual({ success: true });
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toMatchObject({ name: COOKIE_NAME, options: { maxAge: -1 } });
  });
});
