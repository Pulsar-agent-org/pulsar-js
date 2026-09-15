export type Verdict =
  | "valid"
  | "payment_required"
  | "malformed_request"
  | "unknown_nonce"
  | "nonce_used"
  | "nonce_expired"
  | "tx_not_found"
  | "tx_failed"
  | "memo_mismatch"
  | "wrong_destination"
  | "wrong_asset"
  | "insufficient_amount";

export const VERDICTS: readonly Verdict[] = [
  "valid",
  "payment_required",
  "malformed_request",
  "unknown_nonce",
  "nonce_used",
  "nonce_expired",
  "tx_not_found",
  "tx_failed",
  "memo_mismatch",
  "wrong_destination",
  "wrong_asset",
  "insufficient_amount",
];

// A challenge as the provider stores it, keyed by nonce. Verification reads
// these values, never values echoed back by the client.
export interface PaymentRequirement {
  network: "stellar:testnet";
  asset: string; // "XLM" or "CODE:ISSUER"
  amount: string; // canonical decimal in whole units of the asset
  payTo: string; // provider account, G...
  nonce: string; // lowercase hex
  expires: number; // Unix seconds, UTC
}

// What the client presents on the retry.
export interface PaymentProof {
  tx: string; // lowercase hex, 64 chars
  nonce: string; // lowercase hex
}

// The provider's stored record for one nonce.
export interface NonceRecord {
  used: boolean;
  expires: number; // Unix seconds, UTC
}

export interface PaymentOperation {
  type: string; // only "payment" is counted in v0.1
  destination: string;
  asset: string; // "XLM" or "CODE:ISSUER"
  amount: string; // decimal in whole units
}

// A resolved transaction as seen through a Horizon lookup. Core never fetches
// this itself; a caller supplies it, which keeps core free of network access.
export interface ResolvedTransaction {
  found: boolean;
  successful: boolean;
  memoType: "hash" | "text" | "id" | "return" | "none";
  memo: string; // base64 of the 32 memo bytes for a hash memo
  operations: PaymentOperation[];
}

export interface HorizonClient {
  getTransaction(hash: string): Promise<ResolvedTransaction | null>;
}

export interface VerifyResult {
  verdict: Verdict;
  ok: boolean; // true only when verdict === "valid"
}
