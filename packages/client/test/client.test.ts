import { describe, it, expect } from "vitest";
import { serializeChallenge, toStroops } from "@pulsar/core";
import { createPulsarClient } from "../src/client.js";
import { PulsarRefusalError } from "../src/errors.js";
import type { PaymentSubmitter } from "../src/submit.js";

const PAY_TO = "GD4RJ43KGBZ3FNV4LCWZGYNPJQZPITK37QJYRCTF62LPY5S4LRETDAZW";
const NONCE = "90aa9a441c48f8a68be1686f3ff7da1184bf7eaf9f721a0c0b675a0a33109225";

function countingSubmitter(): PaymentSubmitter & { calls: number } {
  const s = {
    calls: 0,
    async submit() {
      s.calls += 1;
      return { tx: "a".repeat(64) };
    },
  };
  return s;
}

// A fetch stub: an unpaid request gets a 402 challenge, a request that carries
// an Authorization header gets 200.
function stubFetch(amount: string) {
  return async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const auth = new Headers(init?.headers).get("Authorization");
    if (auth) return new Response(JSON.stringify({ paid: true }), { status: 200 });
    const challenge = serializeChallenge({
      network: "stellar:testnet",
      asset: "XLM",
      amount,
      pay_to: PAY_TO,
      nonce: NONCE,
      expires: "1789431692",
    });
    return new Response(JSON.stringify({ error: "payment_required" }), {
      status: 402,
      headers: { "WWW-Authenticate": challenge },
    });
  };
}

describe("createPulsarClient refusal paths", () => {
  it("refuses a call above the per-call cap and signs nothing", async () => {
    const submitter = countingSubmitter();
    const client = createPulsarClient({
      maxPerCall: "0.001",
      maxTotal: "1",
      allow: ["api.example.com"],
      fetch: stubFetch("0.002"),
      submitter,
    });
    await expect(client("https://api.example.com/paid")).rejects.toMatchObject({
      code: "per_call_cap",
    });
    expect(submitter.calls).toBe(0);
    expect(client.totalSpentStroops()).toBe(0n);
  });

  it("refuses when the running total would exceed maxTotal", async () => {
    const submitter = countingSubmitter();
    const client = createPulsarClient({
      maxPerCall: "0.002",
      maxTotal: "0.003",
      allow: ["api.example.com"],
      fetch: stubFetch("0.002"),
      submitter,
    });
    const first = await client("https://api.example.com/paid");
    expect(first.status).toBe(200);
    await expect(client("https://api.example.com/paid")).rejects.toMatchObject({
      code: "total_cap",
    });
    expect(submitter.calls).toBe(1);
    expect(client.totalSpentStroops()).toBe(toStroops("0.002"));
  });

  it("refuses a host that is not on the allowlist", async () => {
    const submitter = countingSubmitter();
    const client = createPulsarClient({
      maxPerCall: "1",
      maxTotal: "1",
      allow: ["trusted.example.com"],
      fetch: stubFetch("0.002"),
      submitter,
    });
    await expect(client("https://api.example.com/paid")).rejects.toBeInstanceOf(
      PulsarRefusalError,
    );
    expect(submitter.calls).toBe(0);
  });
});

describe("createPulsarClient success path", () => {
  it("pays within budget and retries with the authorization header", async () => {
    const submitter = countingSubmitter();
    const client = createPulsarClient({
      maxPerCall: "0.01",
      maxTotal: "0.01",
      allow: ["api.example.com"],
      fetch: stubFetch("0.002"),
      submitter,
    });
    const res = await client("https://api.example.com/paid");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ paid: true });
    expect(submitter.calls).toBe(1);
    expect(client.totalSpentStroops()).toBe(toStroops("0.002"));
  });

  it("returns a non-402 response untouched", async () => {
    const submitter = countingSubmitter();
    const client = createPulsarClient({
      maxPerCall: "1",
      maxTotal: "1",
      allow: ["api.example.com"],
      fetch: async () => new Response("ok", { status: 200 }),
      submitter,
    });
    const res = await client("https://api.example.com/free");
    expect(res.status).toBe(200);
    expect(submitter.calls).toBe(0);
  });

  it("returns a 402 without a Pulsar challenge untouched", async () => {
    const submitter = countingSubmitter();
    const client = createPulsarClient({
      maxPerCall: "1",
      maxTotal: "1",
      allow: ["api.example.com"],
      fetch: async () => new Response("nope", { status: 402 }),
      submitter,
    });
    const res = await client("https://api.example.com/paid");
    expect(res.status).toBe(402);
    expect(submitter.calls).toBe(0);
  });
});
