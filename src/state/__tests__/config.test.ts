import { beforeEach, describe, expect, it } from "vitest";
import {
  getConfig,
  isPublicSiteEnabled,
  isSignupEnabled,
  resetConfigForTesting,
} from "../../config";

const FULL_ENV = {
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon-key-123",
  VITE_T120_API_URL: "https://the120.example",
};

function withoutVar(name: keyof typeof FULL_ENV): Record<string, string> {
  const env: Record<string, string> = { ...FULL_ENV };
  delete env[name];
  return env;
}

describe("getConfig", () => {
  beforeEach(() => {
    resetConfigForTesting();
  });

  it("returns all values when every variable is present", () => {
    const config = getConfig(FULL_ENV);
    expect(config).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon-key-123",
      t120ApiUrl: "https://the120.example",
    });
  });

  it("trims surrounding whitespace from values", () => {
    const config = getConfig({
      ...FULL_ENV,
      VITE_SUPABASE_URL: "  https://example.supabase.co  ",
    });
    expect(config.supabaseUrl).toBe("https://example.supabase.co");
  });

  it("throws naming VITE_SUPABASE_URL when it is absent", () => {
    expect(() => getConfig(withoutVar("VITE_SUPABASE_URL"))).toThrowError(
      /VITE_SUPABASE_URL/,
    );
  });

  it("throws naming VITE_SUPABASE_ANON_KEY when it is absent", () => {
    expect(() => getConfig(withoutVar("VITE_SUPABASE_ANON_KEY"))).toThrowError(
      /VITE_SUPABASE_ANON_KEY/,
    );
  });

  it("throws naming VITE_T120_API_URL when it is absent", () => {
    expect(() => getConfig(withoutVar("VITE_T120_API_URL"))).toThrowError(
      /VITE_T120_API_URL/,
    );
  });

  it("treats an empty or whitespace-only value as missing", () => {
    expect(() => getConfig({ ...FULL_ENV, VITE_SUPABASE_ANON_KEY: "   " })).toThrowError(
      /VITE_SUPABASE_ANON_KEY/,
    );
    expect(() => getConfig({ ...FULL_ENV, VITE_T120_API_URL: "" })).toThrowError(
      /VITE_T120_API_URL/,
    );
  });

  it("does not let one injected env leak into a later call", () => {
    getConfig(FULL_ENV);
    expect(() => getConfig({})).toThrowError(/VITE_SUPABASE_URL/);
  });
});

describe("isSignupEnabled (Start Building cutover flag, Rev 11)", () => {
  it("defaults OFF when the flag is unset (no half-live window)", () => {
    // An env WITHOUT the flag (and even missing the required vars) is simply
    // "off", never a throw: the flag is orthogonal to the required-var check.
    expect(isSignupEnabled({})).toBe(false);
    expect(isSignupEnabled(FULL_ENV)).toBe(false);
  });

  it('is ON only for the explicit opt-in strings "true"/"1"', () => {
    expect(isSignupEnabled({ VITE_ENABLE_SIGNUP: "true" })).toBe(true);
    expect(isSignupEnabled({ VITE_ENABLE_SIGNUP: "1" })).toBe(true);
  });

  it("treats any other value as off", () => {
    expect(isSignupEnabled({ VITE_ENABLE_SIGNUP: "false" })).toBe(false);
    expect(isSignupEnabled({ VITE_ENABLE_SIGNUP: "yes" })).toBe(false);
    expect(isSignupEnabled({ VITE_ENABLE_SIGNUP: "" })).toBe(false);
  });
});

describe("isPublicSiteEnabled (public-site cutover flag, real-public-site Unit 4)", () => {
  it("defaults OFF when the flag is unset — deploying dark opens nothing", () => {
    // Mirrors isSignupEnabled exactly: orthogonal to the required-var check,
    // so an env missing the flag (or everything) is "off", never a throw.
    expect(isPublicSiteEnabled({})).toBe(false);
    expect(isPublicSiteEnabled(FULL_ENV)).toBe(false);
  });

  it('is ON only for the explicit opt-in strings "true"/"1"', () => {
    expect(isPublicSiteEnabled({ VITE_ENABLE_PUBLIC_SITE: "true" })).toBe(true);
    expect(isPublicSiteEnabled({ VITE_ENABLE_PUBLIC_SITE: "1" })).toBe(true);
  });

  it("treats any other value as off (and never reads the signup flag)", () => {
    expect(isPublicSiteEnabled({ VITE_ENABLE_PUBLIC_SITE: "false" })).toBe(false);
    expect(isPublicSiteEnabled({ VITE_ENABLE_PUBLIC_SITE: "yes" })).toBe(false);
    expect(isPublicSiteEnabled({ VITE_ENABLE_PUBLIC_SITE: "" })).toBe(false);
    // The two flags are independent gates.
    expect(isPublicSiteEnabled({ VITE_ENABLE_SIGNUP: "true" })).toBe(false);
  });
});
