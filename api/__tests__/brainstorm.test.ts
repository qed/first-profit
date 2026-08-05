import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../brainstorm";
import { resetBrainstormQuota } from "../_lib/brainstormSupport";

const INPUTS = {
  boardGame: "Chess",
  animal: "Dogs",
  sport: "Soccer",
  activity: "Drawing",
  businessType: "digital",
  audience: "fans",
  customization: "local",
  customTwist: "",
};

const IDEAS = Array.from({ length: 5 }, (_, index) => ({
  name: `Digital chess idea ${index + 1}`,
  oneLiner: `A useful digital chess idea number ${index + 1} for local fans.`,
  buyer: "Local chess fans",
  firstTest: `Show a sample of idea ${index + 1} and a price to five possible buyers.`,
  whyItMaySell: `It gives group ${index + 1} a useful personalized digital option.`,
  businessType: "digital",
}));

interface RecordedResponse {
  headers: Record<string, string>;
  statusCode: number | null;
  body: unknown;
}

function makeRes(): { res: VercelResponse; recorded: RecordedResponse } {
  const recorded: RecordedResponse = { headers: {}, statusCode: null, body: null };
  const res = {
    setHeader(name: string, value: string) {
      recorded.headers[name] = value;
      return res;
    },
    status(code: number) {
      recorded.statusCode = code;
      return res;
    },
    json(body: unknown) {
      recorded.body = body;
      return res;
    },
  } as unknown as VercelResponse;
  return { res, recorded };
}

function makeReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: "POST",
    headers: { authorization: "Bearer learner-token" },
    body: { inputs: INPUTS, round: 1 },
    ...overrides,
  } as unknown as VercelRequest;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.DEEPSEEK_API_KEY = "provider-test-key";
  process.env.DEEPSEEK_BASE_URL = "https://provider.example";
  process.env.DEEPSEEK_MODEL = "flash-model";
  process.env.DEEPSEEK_BRAINSTORM_ENABLED = "true";
  resetBrainstormQuota();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_BASE_URL;
  delete process.env.DEEPSEEK_MODEL;
  delete process.env.DEEPSEEK_BRAINSTORM_ENABLED;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/brainstorm", () => {
  it("authenticates the learner, calls the provider, and returns five validated ideas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "user-123" }))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: JSON.stringify({ ideas: IDEAS }) } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { res, recorded } = makeRes();
    await handler(makeReq(), res);

    expect(recorded.statusCode).toBe(200);
    expect(recorded.headers["Cache-Control"]).toBe("no-store");
    expect(recorded.body).toMatchObject({ source: "ai" });
    expect((recorded.body as { ideas: unknown[] }).ideas).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/auth/v1/user");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/chat/completions");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid requests before auth or provider calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { res, recorded } = makeRes();
    await handler(makeReq({ body: { inputs: { ...INPUTS, boardGame: "x".repeat(81) }, round: 1 } }), res);
    expect(recorded.statusCode).toBe(400);
    expect(recorded.body).toEqual({ error: "invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid learner token before spending provider credit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "bad token" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    const { res, recorded } = makeRes();
    await handler(makeReq(), res);
    expect(recorded.statusCode).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a clean 502 when the provider response is empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "user-123" }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { res, recorded } = makeRes();
    await handler(makeReq(), res);
    expect(recorded.statusCode).toBe(502);
    expect(recorded.body).toEqual({ error: "temporarily_unavailable" });
    expect(errorSpy).toHaveBeenCalledWith("brainstorm: provider returned invalid output");
  });

  it("allows POST only", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { res, recorded } = makeRes();
    await handler(makeReq({ method: "GET" }), res);
    expect(recorded.statusCode).toBe(405);
    expect(recorded.headers.Allow).toBe("POST");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays off unless the explicit server-side launch flag is true", async () => {
    delete process.env.DEEPSEEK_BRAINSTORM_ENABLED;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { res, recorded } = makeRes();
    await handler(makeReq(), res);
    expect(recorded.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
