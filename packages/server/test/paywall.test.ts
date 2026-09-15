import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import {
  nonceMemoBase64,
  parseChallenge,
  serializeCredentials,
  verifyPayment,
  type ResolvedTransaction,
} from "@pulsar/core";
import { paywallExpress } from "../src/express.js";
import { InMemoryNonceStore } from "../src/nonce-store.js";
import type { Verifier } from "../src/types.js";

const PAY_TO = "GD4RJ43KGBZ3FNV4LCWZGYNPJQZPITK37QJYRCTF62LPY5S4LRETDAZW";

// A verifier that runs the real core against an injected transaction map, so
// the whole paywall flow is exercised without a network.
function mockVerifier(txMap: Map<string, ResolvedTransaction>): Verifier {
  return {
    async verify(input) {
      return verifyPayment({ ...input, transaction: txMap.get(input.proof.tx) ?? null });
    },
  };
}

function paymentTx(nonce: string, asset: string, amount: string, to = PAY_TO): ResolvedTransaction {
  return {
    found: true,
    successful: true,
    memoType: "hash",
    memo: nonceMemoBase64(nonce),
    operations: [{ type: "payment", destination: to, asset, amount }],
  };
}

const stores: InMemoryNonceStore[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
});

function makeApp(overrides: { clock?: () => number; txMap?: Map<string, ResolvedTransaction> } = {}) {
  const nonceStore = new InMemoryNonceStore({ sweepMs: 0 });
  stores.push(nonceStore);
  const txMap = overrides.txMap ?? new Map<string, ResolvedTransaction>();
  const app = express();
  app.get(
    "/paid",
    paywallExpress({
      price: "0.002",
      payTo: PAY_TO,
      asset: "XLM",
      nonceStore,
      verifier: mockVerifier(txMap),
      ttlSeconds: 60,
      now: overrides.clock,
    }),
    (_req, res) => res.status(200).json({ ok: true }),
  );
  return { app, txMap };
}

function challengeFields(header: string) {
  const parsed = parseChallenge(header);
  if (!parsed.ok) throw new Error("challenge did not parse: " + header);
  return parsed.params;
}

describe("paywall over Express", () => {
  it("answers an unpaid request with a well-formed 402 challenge", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/paid");
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("payment_required");
    const params = challengeFields(res.headers["www-authenticate"]);
    expect(params.network).toBe("stellar:testnet");
    expect(params.asset).toBe("XLM");
    expect(params.amount).toBe("0.002");
    expect(params.pay_to).toBe(PAY_TO);
    expect(params.nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it("serves 200 for a valid payment", async () => {
    const { app, txMap } = makeApp();
    const challenge = await request(app).get("/paid");
    const { nonce } = challengeFields(challenge.headers["www-authenticate"]);
    const tx = "a".repeat(64);
    txMap.set(tx, paymentTx(nonce!, "XLM", "0.002"));

    const res = await request(app)
      .get("/paid")
      .set("Authorization", serializeCredentials({ tx, nonce: nonce! }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("rejects a replayed nonce with nonce_used", async () => {
    const { app, txMap } = makeApp();
    const challenge = await request(app).get("/paid");
    const { nonce } = challengeFields(challenge.headers["www-authenticate"]);
    const tx = "b".repeat(64);
    txMap.set(tx, paymentTx(nonce!, "XLM", "0.002"));
    const auth = serializeCredentials({ tx, nonce: nonce! });

    const first = await request(app).get("/paid").set("Authorization", auth);
    expect(first.status).toBe(200);
    const second = await request(app).get("/paid").set("Authorization", auth);
    expect(second.status).toBe(402);
    expect(second.body.error).toBe("nonce_used");
  });

  it("rejects an expired nonce with nonce_expired and re-challenges", async () => {
    let t = 1_000_000;
    const { app, txMap } = makeApp({ clock: () => t });
    const challenge = await request(app).get("/paid");
    const { nonce } = challengeFields(challenge.headers["www-authenticate"]);
    const tx = "c".repeat(64);
    txMap.set(tx, paymentTx(nonce!, "XLM", "0.002"));

    t += 60 + 5 + 1; // past expiry plus the skew grace
    const res = await request(app)
      .get("/paid")
      .set("Authorization", serializeCredentials({ tx, nonce: nonce! }));
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("nonce_expired");
    expect(res.headers["www-authenticate"]).toContain('error="nonce_expired"');
  });

  it("rejects an underpayment with insufficient_amount", async () => {
    const { app, txMap } = makeApp();
    const challenge = await request(app).get("/paid");
    const { nonce } = challengeFields(challenge.headers["www-authenticate"]);
    const tx = "d".repeat(64);
    txMap.set(tx, paymentTx(nonce!, "XLM", "0.001"));

    const res = await request(app)
      .get("/paid")
      .set("Authorization", serializeCredentials({ tx, nonce: nonce! }));
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("insufficient_amount");
  });

  it("rejects a malformed Authorization header with 400", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/paid").set("Authorization", "Basic zzz");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("malformed_request");
  });
});
