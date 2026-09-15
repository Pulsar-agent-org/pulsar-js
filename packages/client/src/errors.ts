export type RefusalCode = "per_call_cap" | "total_cap" | "allowlist";

// Thrown before any transaction is signed when a payment would violate a cap or
// the host allowlist. Refusing here is the client's core safety property: a
// signing path that skips these checks is the most serious class of bug.
export class PulsarRefusalError extends Error {
  readonly code: RefusalCode;
  readonly host: string;
  readonly amount: string;

  constructor(
    code: RefusalCode,
    message: string,
    host: string,
    amount: string,
  ) {
    super(message);
    this.name = "PulsarRefusalError";
    this.code = code;
    this.host = host;
    this.amount = amount;
  }
}
