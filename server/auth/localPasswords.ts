import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(nodeScrypt);
const KEY_LENGTH = 64;
const PREFIX = "scrypt";

export function normalizeLocalUsername(value: string) {
  return value.trim().toLowerCase();
}

export async function hashLocalPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `${PREFIX}$${salt}$${derived.toString("hex")}`;
}

export async function verifyLocalPassword(password: string, encoded: string) {
  const [prefix, salt, expectedHex] = encoded.split("$");
  if (prefix !== PREFIX || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function verifySecretValue(value: string, expectedValue: string) {
  const actual = Buffer.from(value);
  const expected = Buffer.from(expectedValue);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
