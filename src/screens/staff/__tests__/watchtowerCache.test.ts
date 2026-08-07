/**
 * The Watchtower's shell-cache keys — keyed by criterion so a criterion change
 * invalidates exactly its own entry while a TAB switch invalidates nothing.
 */
import { describe, expect, it } from "vitest";
import { WATCHTOWER_CACHE_PREFIX, watchtowerCacheKey } from "../watchtowerCache";

describe("watchtowerCacheKey", () => {
  it("gives distinct criteria distinct keys", () => {
    expect(watchtowerCacheKey("1.1")).not.toBe(watchtowerCacheKey("1.2"));
    expect(watchtowerCacheKey("1.1")).not.toBe(watchtowerCacheKey("11"));
  });

  it("is stable across calls, so a re-render reads the entry it wrote", () => {
    expect(watchtowerCacheKey("2.3")).toBe(watchtowerCacheKey("2.3"));
  });

  it("namespaces every key, so it can never collide with another tab's slot", () => {
    expect(watchtowerCacheKey("1.1").startsWith(WATCHTOWER_CACHE_PREFIX)).toBe(true);
    expect(watchtowerCacheKey("1.1")).not.toBe("suggestions");
  });
});
