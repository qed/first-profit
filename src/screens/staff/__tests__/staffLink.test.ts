/**
 * /admin boot-URL reader (Change #9) — the verifyLink-precedent pure reader.
 */
import { describe, expect, it } from "vitest";
import { isAdminPath } from "../adminLink";

describe("isAdminPath", () => {
  it("matches /admin and /admin/ exactly", () => {
    expect(isAdminPath({ pathname: "/admin" })).toBe(true);
    expect(isAdminPath({ pathname: "/admin/" })).toBe(true);
  });

  it("refuses everything else (no prefix/suffix hijack)", () => {
    expect(isAdminPath({ pathname: "/" })).toBe(false);
    expect(isAdminPath({ pathname: "" })).toBe(false);
    expect(isAdminPath({ pathname: "/administrator" })).toBe(false);
    expect(isAdminPath({ pathname: "/admin/anything" })).toBe(false);
    expect(isAdminPath({ pathname: "/signup/verify" })).toBe(false);
    expect(isAdminPath({ pathname: "/x/admin" })).toBe(false);
    expect(isAdminPath(null)).toBe(false);
  });
});
