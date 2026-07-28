import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookies } from "cookie";
import { timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

const GOOGLE_STATE_COOKIE = "finance_google_oauth_state";
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const STATE_LIFETIME_SECONDS = 10 * 60;

type PendingGoogleAuthentication = {
  state: string;
  nonce: string;
};

function getAuthStateKey(): Uint8Array {
  if (ENV.cookieSecret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters when Google OAuth is enabled.");
  }

  return new TextEncoder().encode(ENV.cookieSecret);
}

function getGoogleConfiguration() {
  const { googleClientId, googleClientSecret, googleRedirectUri, allowedEmail } = ENV;

  if (!googleClientId || !googleClientSecret || !googleRedirectUri) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.");
  }

  return {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    redirectUri: googleRedirectUri,
    allowedEmail: allowedEmail.toLowerCase(),
  };
}

function constantTimeMatch(left: string, right: string) {
  const leftValue = Buffer.from(left);
  const rightValue = Buffer.from(right);

  return leftValue.length === rightValue.length && timingSafeEqual(leftValue, rightValue);
}

export function isAllowedGoogleIdentity(
  email: unknown,
  emailVerified: unknown,
  allowedEmail: string,
) {
  return (
    typeof email === "string" &&
    emailVerified === true &&
    constantTimeMatch(email.toLowerCase(), allowedEmail.toLowerCase())
  );
}

async function createPendingAuthentication(): Promise<{
  value: string;
  state: string;
  nonce: string;
}> {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const value = await new SignJWT({ state, nonce })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_LIFETIME_SECONDS}s`)
    .sign(getAuthStateKey());

  return { value, state, nonce };
}

async function readPendingAuthentication(req: Request): Promise<PendingGoogleAuthentication | null> {
  const serializedCookies = req.headers.cookie;
  const token = serializedCookies ? parseCookies(serializedCookies)[GOOGLE_STATE_COOKIE] : undefined;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getAuthStateKey(), { algorithms: ["HS256"] });
    const state = payload.state;
    const nonce = payload.nonce;

    if (typeof state !== "string" || typeof nonce !== "string") {
      return null;
    }

    return { state, nonce };
  } catch {
    return null;
  }
}

function googleStateCookieOptions(req: Request) {
  return {
    ...getSessionCookieOptions(req),
    sameSite: "lax" as const,
    maxAge: STATE_LIFETIME_SECONDS * 1000,
  };
}

function clearGoogleStateCookie(res: Response, req: Request) {
  res.clearCookie(GOOGLE_STATE_COOKIE, googleStateCookieOptions(req));
}

function describeGoogleError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "An unknown error occurred while verifying the sign-in request.";
}

export function isGoogleAuthConfigured() {
  return Boolean(
    ENV.googleClientId && ENV.googleClientSecret && ENV.googleRedirectUri && ENV.cookieSecret,
  );
}

export function registerGoogleAuthRoutes(app: Express) {
  app.get("/auth/google", async (req, res) => {
    try {
      const config = getGoogleConfiguration();
      const pending = await createPendingAuthentication();
      const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");

      authorizationUrl.searchParams.set("client_id", config.clientId);
      authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("scope", "openid email profile");
      authorizationUrl.searchParams.set("state", pending.state);
      authorizationUrl.searchParams.set("nonce", pending.nonce);
      authorizationUrl.searchParams.set("login_hint", config.allowedEmail);
      authorizationUrl.searchParams.set("prompt", "select_account");

      res.cookie(GOOGLE_STATE_COOKIE, pending.value, googleStateCookieOptions(req));
      res.redirect(authorizationUrl.toString());
    } catch (error) {
      console.error("[Google OAuth] Unable to start authentication:", describeGoogleError(error));
      res.status(503).send("Google authentication is not configured correctly.");
    }
  });

  app.get("/auth/google/callback", async (req, res) => {
    const configurationError = req.query.error;
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const pending = await readPendingAuthentication(req);

    clearGoogleStateCookie(res, req);

    if (configurationError || !code || !state || !pending || !constantTimeMatch(state, pending.state)) {
      res.status(401).send("The Google sign-in request could not be verified. Please try again.");
      return;
    }

    try {
      const config = getGoogleConfiguration();
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Google did not accept the authorization code.");
      }

      const tokenPayload = (await tokenResponse.json()) as { id_token?: unknown };
      if (typeof tokenPayload.id_token !== "string") {
        throw new Error("Google did not return an identity token.");
      }

      const { payload } = await jwtVerify(tokenPayload.id_token, GOOGLE_JWKS, {
        audience: config.clientId,
        issuer: GOOGLE_ISSUERS,
      });

      const subject = payload.sub;
      const email = payload.email;
      const emailVerified = payload.email_verified;
      const nonce = payload.nonce;

      if (
        typeof subject !== "string" ||
        typeof email !== "string" ||
        emailVerified !== true ||
        typeof nonce !== "string" ||
        !constantTimeMatch(nonce, pending.nonce)
      ) {
        throw new Error("Google returned an invalid identity token.");
      }

      if (!isAllowedGoogleIdentity(email, emailVerified, config.allowedEmail)) {
        res.status(403).send("This Google account is not authorized to access the application.");
        return;
      }

      const openId = `google:${subject}`;
      const displayName = typeof payload.name === "string" ? payload.name : email;
      await db.upsertUser({
        openId,
        name: displayName,
        email,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, { name: displayName });
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.redirect("/");
    } catch (error) {
      console.error("[Google OAuth] Unable to complete authentication:", describeGoogleError(error));
      res.status(401).send("The Google sign-in request could not be completed.");
    }
  });
}
