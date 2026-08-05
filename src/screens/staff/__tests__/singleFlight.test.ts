/**
 * singleFlight — the staff shell's refresh de-duplicator.
 *
 * The shell's UI-level guarantee ("an aged token fires EXACTLY ONE refresh
 * grant") is pinned in StaffShell.test.tsx; these tests pin the primitive's
 * concurrency contract directly, which the shell alone cannot exercise until
 * the Watchtower tab starts fetching in Unit 5.
 */
import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "../singleFlight";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSingleFlight", () => {
  it("runs the work ONCE for concurrent callers and hands all of them the same result", async () => {
    const flight = createSingleFlight<string>();
    const gate = deferred<string>();
    const begin = vi.fn(() => gate.promise);

    const a = flight.run(begin);
    const b = flight.run(begin);
    const c = flight.run(begin);
    expect(begin).toHaveBeenCalledTimes(1);
    expect(flight.isPending()).toBe(true);

    gate.resolve("session-1");
    expect(await Promise.all([a, b, c])).toEqual(["session-1", "session-1", "session-1"]);
  });

  it("de-duplicates concurrency, it does NOT cache: a later call runs again", async () => {
    const flight = createSingleFlight<number>();
    let n = 0;
    const begin = vi.fn(async () => ++n);

    expect(await flight.run(begin)).toBe(1);
    expect(flight.isPending()).toBe(false);
    expect(await flight.run(begin)).toBe(2);
    expect(begin).toHaveBeenCalledTimes(2);
  });

  it("a rejection releases the slot — a failed refresh never wedges the next one shut", async () => {
    const flight = createSingleFlight<string>();
    const boom = deferred<string>();
    const failing = vi.fn(() => boom.promise);

    const first = flight.run(failing);
    boom.reject(new Error("network"));
    await expect(first).rejects.toThrow("network");
    expect(flight.isPending()).toBe(false);

    const ok = vi.fn(async () => "session-2");
    expect(await flight.run(ok)).toBe("session-2");
  });

  it("callers that join mid-flight still get the single result", async () => {
    const flight = createSingleFlight<string>();
    const gate = deferred<string>();
    const begin = vi.fn(() => gate.promise);

    const first = flight.run(begin);
    await Promise.resolve(); // a microtask later — still in flight
    const late = flight.run(begin);
    expect(begin).toHaveBeenCalledTimes(1);

    gate.resolve("session-3");
    expect(await first).toBe("session-3");
    expect(await late).toBe("session-3");
  });
});
