import type {
  NonceRecord,
  PaymentProof,
  PaymentRequirement,
  VerifyResult,
} from "@pulsar/core";

// The subset of a request the paywall reads.
export interface PaywallRequest {
  method: string;
  path: string;
  authorization: string | undefined;
}

// What the provider stores for one issued nonce. The full requirement lives
// here so verification never trusts client-echoed values.
export interface StoredNonce {
  nonce: string;
  asset: string;
  amount: string;
  payTo: string;
  expires: number; // Unix seconds, UTC
  used: boolean;
}

// A nonce store with atomic single-use consumption. The in-memory store is the
// default; a persistent store implements the same interface. See ISSUES.md.
export interface NonceStore {
  create(record: StoredNonce): Promise<void>;
  get(nonce: string): Promise<StoredNonce | null>;
  // Transition unused -> used atomically. Returns true only for the caller that
  // won the transition; a second caller and an unknown nonce return false.
  consume(nonce: string): Promise<boolean>;
}

// Resolves a proof to a verdict. The in-process verifier fetches the
// transaction through an injected Horizon client, then calls verifyPayment.
export interface Verifier {
  verify(input: {
    proof: PaymentProof;
    requirement: PaymentRequirement;
    now: number;
    nonceRecord: NonceRecord | null;
  }): Promise<VerifyResult>;
}

export interface PaywallOptions {
  price: string | ((req: PaywallRequest) => string);
  payTo: string;
  asset: string; // "XLM" or "CODE:ISSUER"
  nonceStore: NonceStore;
  verifier: Verifier;
  network?: "stellar:testnet";
  ttlSeconds?: number; // nonce lifetime, default 300
  now?: () => number; // injectable clock, seconds
}

export type PaywallResult =
  | { kind: "pass" }
  | {
      kind: "respond";
      status: number;
      headers: Record<string, string>;
      body: { error: string; message: string };
    };
