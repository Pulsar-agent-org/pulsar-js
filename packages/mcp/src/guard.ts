import {
  canonicalAmount,
  generateNonce,
  isValidNonce,
  serializeChallenge,
  type PaymentRequirement,
  type Verdict,
} from "@pulsar/core";
import type { StoredNonce } from "@pulsar/server";
import type {
  PulsarMcpOptions,
  PulsarProof,
  PulsarToolResult,
} from "./types.js";

const TX = /^[0-9a-f]{64}$/;
const DEFAULT_TTL = 300;
const RECHALLENGE = new Set<Verdict>(["unknown_nonce", "nonce_expired"]);

export type GuardResult =
  | { proceed: true; args: Record<string, unknown> }
  | { proceed: false; result: PulsarToolResult };

function clockOf(options: PulsarMcpOptions): number {
  return (options.now ?? (() => Math.floor(Date.now() / 1000)))();
}

async function issueChallenge(
  options: PulsarMcpOptions,
  amount: string,
  now: number,
  error: Verdict | "payment_required",
): Promise<PulsarToolResult> {
  const nonce = generateNonce();
  const expires = now + (options.ttlSeconds ?? DEFAULT_TTL);
  const network = options.network ?? "stellar:testnet";
  const stored: StoredNonce = {
    nonce,
    asset: options.asset,
    amount,
    payTo: options.payTo,
    expires,
    used: false,
  };
  await options.nonceStore.create(stored);

  const params: Record<string, string> = {
    network,
    asset: options.asset,
    amount,
    pay_to: options.payTo,
    nonce,
    expires: String(expires),
  };
  if (error !== "payment_required") params.error = error;

  const pulsar = {
    kind: "challenge",
    error,
    challenge: serializeChallenge(params),
    requirement: params,
  };
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Pulsar payment required: ${JSON.stringify(pulsar)}`,
      },
    ],
    structuredContent: { pulsar },
  };
}

function errorResult(verdict: Verdict): PulsarToolResult {
  const pulsar = { kind: "error", error: verdict };
  return {
    isError: true,
    content: [{ type: "text", text: `Pulsar verification failed: ${verdict}` }],
    structuredContent: { pulsar },
  };
}

// Decide whether a tool call may run. Free tools proceed. A priced tool needs a
// valid, unused payment proof; otherwise a structured challenge or error is
// returned for the client to act on. Fails closed.
export async function guardToolCall(
  options: PulsarMcpOptions,
  toolName: string,
  rawArgs: Record<string, unknown> | undefined,
): Promise<GuardResult> {
  const price = options.prices[toolName];
  const args = rawArgs ?? {};
  if (price === undefined) return { proceed: true, args };

  const amount = canonicalAmount(price);
  const now = clockOf(options);
  const proof = args._pulsar as PulsarProof | undefined;

  if (!proof) {
    return {
      proceed: false,
      result: await issueChallenge(options, amount, now, "payment_required"),
    };
  }
  if (
    typeof proof.tx !== "string" ||
    !TX.test(proof.tx) ||
    !isValidNonce(proof.nonce)
  ) {
    return { proceed: false, result: errorResult("malformed_request") };
  }

  const stored = await options.nonceStore.get(proof.nonce);
  const requirement: PaymentRequirement = stored
    ? {
        network: options.network ?? "stellar:testnet",
        asset: stored.asset,
        amount: stored.amount,
        payTo: stored.payTo,
        nonce: stored.nonce,
        expires: stored.expires,
      }
    : {
        network: options.network ?? "stellar:testnet",
        asset: options.asset,
        amount: "0",
        payTo: options.payTo,
        nonce: proof.nonce,
        expires: now,
      };

  const { verdict } = await options.verifier.verify({
    proof: { tx: proof.tx, nonce: proof.nonce },
    requirement,
    now,
    nonceRecord: stored ? { used: stored.used, expires: stored.expires } : null,
  });

  let final = verdict;
  if (final === "valid") {
    const won = await options.nonceStore.consume(proof.nonce);
    if (!won) final = "nonce_used";
  }

  if (final === "valid") {
    const { _pulsar, ...rest } = args;
    void _pulsar;
    return { proceed: true, args: rest };
  }
  if (RECHALLENGE.has(final)) {
    return {
      proceed: false,
      result: await issueChallenge(options, amount, now, final),
    };
  }
  return { proceed: false, result: errorResult(final) };
}
