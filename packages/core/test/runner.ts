// Implements the JSON-in/JSON-out runner contract from pulsar-spec against the
// core functions. A vector passes when runVector(kind, input) deep-equals the
// vector's expect.
import {
  serializeChallenge,
  serializeCredentials,
  parseChallenge,
  parseCredentials,
  validateNonce,
  verifyPayment,
  type PaymentRequirement,
  type ResolvedTransaction,
} from "../src/index.js";

export type Kind = "header-serialize" | "header-parse" | "nonce-validate" | "verify";

function toRequirement(r: any): PaymentRequirement {
  return {
    network: r.network,
    asset: r.asset,
    amount: r.amount,
    payTo: r.pay_to,
    nonce: r.nonce,
    expires: r.expires,
  };
}

function toTransaction(t: any): ResolvedTransaction | null {
  if (t === null || t === undefined) return null;
  return {
    found: t.found,
    successful: t.successful,
    memoType: t.memo_type,
    memo: t.memo,
    operations: t.operations ?? [],
  };
}

export function runVector(kind: Kind, input: any): unknown {
  switch (kind) {
    case "header-serialize": {
      const header =
        input.type === "challenge"
          ? serializeChallenge(input.params)
          : serializeCredentials(input.params);
      return { header };
    }
    case "header-parse": {
      const result =
        input.type === "challenge"
          ? parseChallenge(input.header)
          : parseCredentials(input.header);
      return result;
    }
    case "nonce-validate": {
      const verdict = validateNonce({
        nonce: input.nonce,
        now: input.now,
        record: input.record,
      });
      return { verdict };
    }
    case "verify": {
      const { verdict } = verifyPayment({
        proof: { tx: input.proof.tx, nonce: input.proof.nonce },
        requirement: toRequirement(input.requirement),
        now: input.now,
        nonceRecord: input.nonce_record ?? null,
        transaction: toTransaction(input.transaction),
      });
      return { verdict };
    }
  }
}
