// Stellar assets carry seven decimal places. One whole unit is 10^7 stroops.
const STROOPS_PER_UNIT = 10_000_000n;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]{1,7})?$/;

export class AmountError extends Error {}

// Convert a decimal amount string to an integer number of stroops with exact
// fixed-point arithmetic. No IEEE-754 float ever touches a payment amount.
export function toStroops(amount: string): bigint {
  const m = DECIMAL.exec(amount);
  if (!m) throw new AmountError(`invalid amount: ${amount}`);
  const intPart = m[1]!;
  const fracRaw = m[2] ? m[2].slice(1) : "";
  const fracPadded = (fracRaw + "0000000").slice(0, 7);
  return BigInt(intPart) * STROOPS_PER_UNIT + BigInt(fracPadded);
}

export function isValidAmount(amount: string): boolean {
  return DECIMAL.test(amount);
}

// Canonical decimal form: no leading zeros beyond a single 0, no trailing
// fractional zeros, no trailing dot.
export function canonicalAmount(amount: string): string {
  if (!DECIMAL.test(amount)) throw new AmountError(`invalid amount: ${amount}`);
  const [intPart, fracRaw = ""] = amount.split(".");
  const frac = fracRaw.replace(/0+$/, "");
  return frac.length > 0 ? `${intPart}.${frac}` : intPart!;
}
