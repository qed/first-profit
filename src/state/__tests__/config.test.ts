import { beforeEach, describe, expect, it } from "vitest";
import { getConfig, resetConfigForTesting } from "../../config";

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
