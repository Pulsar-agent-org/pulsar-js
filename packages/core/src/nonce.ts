import { randomBytes, createHash } from "node:crypto";
import { SKEW_SECONDS } from "./spec.js";
import type { NonceRecord, Verdict } from "./types.js";

const NONCE = /^[0-9a-f]{32,128}$/;

// At least 16 bytes of CSPRNG entropy, encoded lowercase hex.
export function generateNonce(bytes = 32): string {
  if (bytes < 16) throw new Error("a nonce needs at least 16 bytes of entropy");
  return randomBytes(bytes).toString("hex");
}

export function isValidNonce(nonce: string): boolean {
  return NONCE.test(nonce) && nonce.length % 2 === 0;
}

// The memo that binds a payment to this nonce: SHA-256 of the ASCII nonce
// string, as base64 of the 32 digest bytes (the form Horizon reports).
export function nonceMemoBase64(nonce: string): string {
  return createHash("sha256").update(nonce, "ascii").digest("base64");
}

// The pre-chain nonce checks, in spec order. Chain checks live in verifyPayment.
export function validateNonce(input: {
  nonce: string;
  now: number;
  record: NonceRecord | null;
}): Verdict {
  if (!isValidNonce(input.nonce)) return "malformed_request";
  if (input.record === null) return "unknown_nonce";
  if (input.record.used) return "nonce_used";
  if (input.now > input.record.expires + SKEW_SECONDS) return "nonce_expired";
  return "valid";
}
