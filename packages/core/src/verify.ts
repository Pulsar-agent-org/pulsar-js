import { isValidAmount, toStroops } from "./amount.js";
import { isValidNonce, nonceMemoBase64 } from "./nonce.js";
import { SKEW_SECONDS } from "./spec.js";
import type {
  HorizonClient,
  NonceRecord,
  PaymentProof,
  PaymentRequirement,
  ResolvedTransaction,
  VerifyResult,
} from "./types.js";

const ACCOUNT = /^G[A-Z0-9]{55}$/;
const ASSET = /^(XLM|[A-Za-z0-9]{1,12}:G[A-Z0-9]{55})$/;
const TX = /^[0-9a-f]{64}$/;

function requirementWellFormed(r: PaymentRequirement): boolean {
  return (
    r.network === "stellar:testnet" &&
    ASSET.test(r.asset) &&
    isValidAmount(r.amount) &&
    ACCOUNT.test(r.payTo) &&
    isValidNonce(r.nonce) &&
    Number.isInteger(r.expires)
  );
}

function proofWellFormed(p: PaymentProof): boolean {
  return TX.test(p.tx) && isValidNonce(p.nonce);
}

export interface VerifyInput {
  proof: PaymentProof;
  requirement: PaymentRequirement;
  now: number;
  nonceRecord: NonceRecord | null;
  transaction: ResolvedTransaction | null;
}

// Pure verification. Applies the spec section 6 checks in order and returns on
// the first failure. Fails closed: any missing input yields a failure verdict.
export function verifyPayment(input: VerifyInput): VerifyResult {
  const { proof, requirement, now, nonceRecord, transaction } = input;

  const verdict = ((): VerifyResult["verdict"] => {
    if (!proofWellFormed(proof) || !requirementWellFormed(requirement)) {
      return "malformed_request";
    }
    if (nonceRecord === null) return "unknown_nonce";
    if (nonceRecord.used) return "nonce_used";
    if (now > nonceRecord.expires + SKEW_SECONDS) return "nonce_expired";

    if (transaction === null || !transaction.found) return "tx_not_found";
    if (!transaction.successful) return "tx_failed";

    if (
      transaction.memoType !== "hash" ||
      transaction.memo !== nonceMemoBase64(requirement.nonce)
    ) {
      return "memo_mismatch";
    }

    const toPayTo = transaction.operations.filter(
      (op) => op.type === "payment" && op.destination === requirement.payTo,
    );
    if (toPayTo.length === 0) return "wrong_destination";

    const inAsset = toPayTo.filter((op) => op.asset === requirement.asset);
    if (inAsset.length === 0) return "wrong_asset";

    const paid = inAsset.reduce((sum, op) => sum + toStroops(op.amount), 0n);
    if (paid < toStroops(requirement.amount)) return "insufficient_amount";

    return "valid";
  })();

  return { verdict, ok: verdict === "valid" };
}

// Convenience for a caller that has a Horizon client: resolve the transaction,
// then verify. Core stays pure; the network access lives in the injected client.
export async function resolveAndVerify(
  input: Omit<VerifyInput, "transaction"> & { horizon: HorizonClient },
): Promise<VerifyResult> {
  const transaction = await input.horizon.getTransaction(input.proof.tx);
  return verifyPayment({ ...input, transaction });
}
