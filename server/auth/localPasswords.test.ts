import { describe, expect, it } from "vitest";
import { hashLocalPassword, normalizeLocalUsername, verifyLocalPassword } from "./localPasswords";

describe("local password hashing", () => {
  it("normalizes usernames and verifies only the original password", async () => {
    const passwordHash = await hashLocalPassword("una-clave-segura");

    expect(normalizeLocalUsername("  JuAnLu  ")).toBe("juanlu");
    expect(passwordHash).not.toContain("una-clave-segura");
    await expect(verifyLocalPassword("una-clave-segura", passwordHash)).resolves.toBe(true);
    await expect(verifyLocalPassword("otra-clave", passwordHash)).resolves.toBe(false);
  });
});
