/**
 * /staff boot-URL reader (Change #9) — the verifyLink-precedent pure reader.
 */
import { describe, expect, it } from "vitest";
import { isLegacyAdminPath, isStaffPath } from "../staffLink";

describe("isStaffPath", () => {
  it("matches /staff and /staff/ exactly", () => {
    expect(isStaffPath({ pathname: "/staff" })).toBe(true);
    expect(isStaffPath({ pathname: "/staff/" })).toBe(true);
  });

  it("refuses everything else (no prefix/suffix hijack)", () => {
    expect(isStaffPath({ pathname: "/" })).toBe(false);
    expect(isStaffPath({ pathname: "" })).toBe(false);
    expect(isStaffPath({ pathname: "/stafff" })).toBe(false);
    expect(isStaffPath({ pathname: "/staff/anything" })).toBe(false);
    expect(isStaffPath({ pathname: "/signup/verify" })).toBe(false);
    expect(isStaffPath({ pathname: "/x/staff" })).toBe(false);
    expect(isStaffPath(null)).toBe(false);
  });

  it("the OLD /admin path is not /staff itself — it is handled by the legacy reader", () => {
    expect(isStaffPath({ pathname: "/admin" })).toBe(false);
  });
});

describe("isLegacyAdminPath", () => {
  it("matches the retired /admin and /admin/ exactly", () => {
    expect(isLegacyAdminPath({ pathname: "/admin" })).toBe(true);
    expect(isLegacyAdminPath({ pathname: "/admin/" })).toBe(true);
  });

  it("refuses everything else (no prefix/suffix hijack)", () => {
    expect(isLegacyAdminPath({ pathname: "/" })).toBe(false);
    expect(isLegacyAdminPath({ pathname: "" })).toBe(false);
    expect(isLegacyAdminPath({ pathname: "/administrator" })).toBe(false);
    expect(isLegacyAdminPath({ pathname: "/admin/anything" })).toBe(false);
    expect(isLegacyAdminPath({ pathname: "/x/admin" })).toBe(false);
    expect(isLegacyAdminPath({ pathname: "/staff" })).toBe(false);
    expect(isLegacyAdminPath(null)).toBe(false);
  });
});
