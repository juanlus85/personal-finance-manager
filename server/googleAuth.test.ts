import { describe, expect, it } from "vitest";
import { isAllowedGoogleIdentity } from "./_core/googleAuth";

describe("Google OAuth access allowlist", () => {
  const allowedEmail = "juanlu85@gmail.com";

  it("allows only the verified configured Google account", () => {
    expect(isAllowedGoogleIdentity("juanlu85@gmail.com", true, allowedEmail)).toBe(true);
    expect(isAllowedGoogleIdentity("JUANLU85@GMAIL.COM", true, allowedEmail)).toBe(true);
  });

  it("rejects another account or an unverified email claim", () => {
    expect(isAllowedGoogleIdentity("other@example.com", true, allowedEmail)).toBe(false);
    expect(isAllowedGoogleIdentity("juanlu85@gmail.com", false, allowedEmail)).toBe(false);
    expect(isAllowedGoogleIdentity(undefined, true, allowedEmail)).toBe(false);
  });

  it("leaves Google disabled when the published client uses local authentication", () => {
    expect(process.env.VITE_AUTH_PROVIDER).toBe("local");
  });
});
