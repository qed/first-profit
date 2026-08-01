import { describe, expect, it } from "vitest";
import { readVerifyToken } from "../verifyLink";

/**
 * The verify-return deep-link reader (Slice B Unit 9). Pure over an injected
 * location, so no browser is needed.
 */
describe("readVerifyToken", () => {
  it("reads ?token= on the /signup/verify path (the emailed link shape)", () => {
    expect(readVerifyToken({ pathname: "/signup/verify", search: "?token=abc123" })).toBe("abc123");
  });

  it("tolerates a trailing slash on the verify path", () => {
    expect(readVerifyToken({ pathname: "/signup/verify/", search: "?token=xyz" })).toBe("xyz");
  });

  it("reads ?fpv= on any path", () => {
    expect(readVerifyToken({ pathname: "/", search: "?fpv=deep789" })).toBe("deep789");
  });

  it("ignores a bare ?token= that is NOT on the verify path (no hijack)", () => {
    expect(readVerifyToken({ pathname: "/dashboard", search: "?token=nope" })).toBeNull();
  });

  it("returns null with no token", () => {
    expect(readVerifyToken({ pathname: "/signup/verify", search: "" })).toBeNull();
    expect(readVerifyToken({ pathname: "/", search: "" })).toBeNull();
  });

  it("returns null for null location (non-browser)", () => {
    expect(readVerifyToken(null)).toBeNull();
  });
});
