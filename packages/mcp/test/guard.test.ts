import { describe, it, expect, afterEach } from "vitest";
import { nonceMemoBase64, verifyPayment, type ResolvedTransaction } from "@pulsar/core";
import { InMemoryNonceStore, type Verifier } from "@pulsar/server";
import { guardToolCall } from "../src/guard.js";
import type { PulsarMcpOptions } from "../src/types.js";

const PAY_TO = "GD4RJ43KGBZ3FNV4LCWZGYNPJQZPITK37QJYRCTF62LPY5S4LRETDAZW";

function mockVerifier(txMap: Map<string, ResolvedTransaction>): Verifier {
  return {
    async verify(input) {
      return verifyPayment({ ...input, transaction: txMap.get(input.proof.tx) ?? null });
    },
  };
}

const stores: InMemoryNonceStore[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
});

function makeOptions(txMap: Map<string, ResolvedTransaction>): PulsarMcpOptions {
  const nonceStore = new InMemoryNonceStore({ sweepMs: 0 });
  stores.push(nonceStore);
  return {
    prices: { summarize: "0.002" },
    payTo: PAY_TO,
    asset: "XLM",
    nonceStore,
    verifier: mockVerifier(txMap),
  };
}

function nonceFrom(result: any): string {
  return result.structuredContent.pulsar.requirement.nonce;
}

describe("guardToolCall", () => {
  it("challenges a priced call that carries no proof", async () => {
    const options = makeOptions(new Map());
    const g = await guardToolCall(options, "summarize", { text: "hi" });
    expect(g.proceed).toBe(false);
    if (g.proceed) return;
    expect(g.result.structuredContent!.pulsar).toMatchObject({
      kind: "challenge",
      error: "payment_required",
    });
  });

  it("proceeds on a valid proof and strips the _pulsar field", async () => {
    const txMap = new Map<string, ResolvedTransaction>();
    const options = makeOptions(txMap);
    const challenge = await guardToolCall(options, "summarize", { text: "hi" });
    const nonce = nonceFrom((challenge as { result: unknown }).result);
    const tx = "a".repeat(64);
    txMap.set(tx, {
      found: true,
      successful: true,
      memoType: "hash",
      memo: nonceMemoBase64(nonce),
      operations: [{ type: "payment", destination: PAY_TO, asset: "XLM", amount: "0.002" }],
    });

    const g = await guardToolCall(options, "summarize", { text: "hi", _pulsar: { tx, nonce } });
    expect(g.proceed).toBe(true);
    if (!g.proceed) return;
    expect(g.args).toEqual({ text: "hi" });
  });

  it("rejects a replayed proof with nonce_used", async () => {
    const txMap = new Map<string, ResolvedTransaction>();
    const options = makeOptions(txMap);
    const challenge = await guardToolCall(options, "summarize", {});
    const nonce = nonceFrom((challenge as { result: unknown }).result);
    const tx = "b".repeat(64);
    txMap.set(tx, {
      found: true,
      successful: true,
      memoType: "hash",
      memo: nonceMemoBase64(nonce),
      operations: [{ type: "payment", destination: PAY_TO, asset: "XLM", amount: "0.002" }],
    });

    const first = await guardToolCall(options, "summarize", { _pulsar: { tx, nonce } });
    expect(first.proceed).toBe(true);
    const second = await guardToolCall(options, "summarize", { _pulsar: { tx, nonce } });
    expect(second.proceed).toBe(false);
    if (second.proceed) return;
    expect(second.result.structuredContent!.pulsar).toMatchObject({ error: "nonce_used" });
  });

  it("lets a tool with no price run free", async () => {
    const options = makeOptions(new Map());
    const g = await guardToolCall(options, "ping", { x: 1 });
    expect(g.proceed).toBe(true);
    if (!g.proceed) return;
    expect(g.args).toEqual({ x: 1 });
  });
});
