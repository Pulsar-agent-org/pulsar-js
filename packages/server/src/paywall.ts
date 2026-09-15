import {
  canonicalAmount,
  generateNonce,
  parseCredentials,
  serializeChallenge,
  type PaymentRequirement,
  type Verdict,
} from "@pulsar/core";
import type { PaywallOptions, PaywallRequest, PaywallResult, StoredNonce } from "./types.js";

const DEFAULT_TTL = 300;

// Verdicts that mint a fresh challenge so the client can pay again.
const RECHALLENGE = new Set<Verdict>(["unknown_nonce", "nonce_expired"]);

function priceFor(options: PaywallOptions, req: PaywallRequest): string {
  const raw = typeof options.price === "function" ? options.price(req) : options.price;
  return canonicalAmount(raw);
}

async function issueChallenge(
  options: PaywallOptions,
  req: PaywallRequest,
  now: number,
  error?: Verdict,
): Promise<PaywallResult> {
  const amount = priceFor(options, req);
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

  const challengeParams: Record<string, string> = {
    network,
    asset: options.asset,
    amount,
    pay_to: options.payTo,
    nonce,
    expires: String(expires),
  };
  if (error) challengeParams.error = error;

  return {
    kind: "respond",
    status: 402,
    headers: {
      "WWW-Authenticate": serializeChallenge(challengeParams),
      "Content-Type": "application/json",
    },
    body: { error: error ?? "payment_required", message: messageFor(error ?? "payment_required") },
  };
}

function messageFor(verdict: string): string {
  const table: Record<string, string> = {
    payment_required: "Payment is required to access this resource.",
    malformed_request: "The Authorization header could not be parsed.",
    unknown_nonce: "The nonce was not issued by this server or has expired.",
    nonce_used: "This payment has already been redeemed.",
    nonce_expired: "The challenge expired. Pay against the new one.",
    tx_not_found: "The transaction is not yet visible on the network.",
    tx_failed: "The transaction did not succeed.",
    memo_mismatch: "The payment memo does not match the challenge.",
    wrong_destination: "The payment was sent to the wrong account.",
    wrong_asset: "The payment used the wrong asset.",
    insufficient_amount: "The payment was below the required amount.",
  };
  return table[verdict] ?? "Payment verification failed.";
}

// Framework-agnostic paywall. Given a request, it either passes (the payment is
// verified) or returns a response the adapter should send. Fails closed: a
// resource is passed only after a valid, freshly consumed nonce.
export async function paywall(
  options: PaywallOptions,
  req: PaywallRequest,
): Promise<PaywallResult> {
  const now = (options.now ?? (() => Math.floor(Date.now() / 1000)))();

  if (!req.authorization) {
    return issueChallenge(options, req, now);
  }

  const parsed = parseCredentials(req.authorization);
  if (!parsed.ok) {
    return {
      kind: "respond",
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "malformed_request", message: messageFor("malformed_request") },
    };
  }

  const proof = { tx: parsed.params.tx!, nonce: parsed.params.nonce! };
  const stored = await options.nonceStore.get(proof.nonce);

  const requirement: PaymentRequirement | null = stored
    ? {
        network: options.network ?? "stellar:testnet",
        asset: stored.asset,
        amount: stored.amount,
        payTo: stored.payTo,
        nonce: stored.nonce,
        expires: stored.expires,
      }
    : {
        // No stored requirement: verification returns unknown_nonce regardless
        // of these placeholders, which are never used to accept a payment.
        network: options.network ?? "stellar:testnet",
        asset: options.asset,
        amount: "0",
        payTo: options.payTo,
        nonce: proof.nonce,
        expires: now,
      };

  const result = await options.verifier.verify({
    proof,
    requirement,
    now,
    nonceRecord: stored ? { used: stored.used, expires: stored.expires } : null,
  });

  let verdict = result.verdict;
  if (verdict === "valid") {
    const won = await options.nonceStore.consume(proof.nonce);
    if (!won) verdict = "nonce_used"; // lost the race, or already consumed
  }

  if (verdict === "valid") return { kind: "pass" };

  if (verdict === "malformed_request") {
    return {
      kind: "respond",
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: verdict, message: messageFor(verdict) },
    };
  }

  if (RECHALLENGE.has(verdict)) {
    return issueChallenge(options, req, now, verdict);
  }

  return {
    kind: "respond",
    status: 402,
    headers: { "Content-Type": "application/json" },
    body: { error: verdict, message: messageFor(verdict) },
  };
}
