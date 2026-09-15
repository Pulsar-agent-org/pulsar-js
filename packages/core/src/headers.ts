import { canonicalAmount } from "./amount.js";
import { VERDICTS } from "./types.js";

const ACCOUNT = /^G[A-Z0-9]{55}$/;
const ASSET = /^(XLM|[A-Za-z0-9]{1,12}:G[A-Z0-9]{55})$/;
const AMOUNT = /^(0|[1-9][0-9]*)(\.[0-9]{1,7})?$/;
const NONCE = /^[0-9a-f]{32,128}$/;
const TX = /^[0-9a-f]{64}$/;
const EXPIRES = /^[0-9]+$/;
const NETWORK = /^stellar:testnet$/;
const ERROR_CODES = new Set<string>(VERDICTS);

const CHALLENGE_ORDER = [
  "network",
  "asset",
  "amount",
  "pay_to",
  "nonce",
  "expires",
  "error",
] as const;
const CHALLENGE_REQUIRED = ["network", "asset", "amount", "pay_to", "nonce", "expires"];
const CREDENTIAL_ORDER = ["tx", "nonce"] as const;

export type HeaderKind = "challenge" | "credentials";

export type ParseResult =
  | { ok: true; params: Record<string, string> }
  | { ok: false; error: "malformed_request" };

function quote(value: string): string {
  return `"${value}"`;
}

export function serializeChallenge(params: Record<string, string>): string {
  const out: string[] = [];
  for (const key of CHALLENGE_ORDER) {
    const value = params[key];
    if (value === undefined) continue;
    const emitted = key === "amount" ? canonicalAmount(value) : value;
    out.push(`${key}=${quote(emitted)}`);
  }
  return `Pulsar ${out.join(", ")}`;
}

export function serializeCredentials(params: Record<string, string>): string {
  const out: string[] = [];
  for (const key of CREDENTIAL_ORDER) {
    const value = params[key];
    if (value === undefined) continue;
    out.push(`${key}=${quote(value)}`);
  }
  return `Pulsar ${out.join(", ")}`;
}

const PAIR = /^([a-z_]+)="([^"]*)"$/;

function validate(kind: HeaderKind, params: Record<string, string>): boolean {
  const allowed =
    kind === "challenge"
      ? new Set(CHALLENGE_ORDER as readonly string[])
      : new Set(CREDENTIAL_ORDER as readonly string[]);
  for (const key of Object.keys(params)) {
    if (!allowed.has(key)) return false;
  }
  if (kind === "challenge") {
    for (const key of CHALLENGE_REQUIRED) {
      if (params[key] === undefined) return false;
    }
    if (!NETWORK.test(params.network!)) return false;
    if (!ASSET.test(params.asset!)) return false;
    if (!AMOUNT.test(params.amount!)) return false;
    if (!ACCOUNT.test(params.pay_to!)) return false;
    if (!NONCE.test(params.nonce!) || params.nonce!.length % 2 !== 0) return false;
    if (!EXPIRES.test(params.expires!)) return false;
    if (params.error !== undefined && !ERROR_CODES.has(params.error)) return false;
  } else {
    if (params.tx === undefined || params.nonce === undefined) return false;
    if (!TX.test(params.tx)) return false;
    if (!NONCE.test(params.nonce) || params.nonce.length % 2 !== 0) return false;
  }
  return true;
}

function parse(kind: HeaderKind, header: string): ParseResult {
  const fail: ParseResult = { ok: false, error: "malformed_request" };
  const trimmed = header.trimStart();
  if (!trimmed.startsWith("Pulsar")) return fail;
  const rest = trimmed.slice("Pulsar".length);
  // The scheme name must be followed by at least one space.
  if (!/^\s/.test(rest)) return fail;
  const body = rest.trim();
  if (body.length === 0) return fail;

  const params: Record<string, string> = {};
  for (const rawPart of body.split(",")) {
    const part = rawPart.trim();
    const m = PAIR.exec(part);
    if (!m) return fail;
    const key = m[1]!;
    if (params[key] !== undefined) return fail; // duplicate
    params[key] = m[2]!;
  }
  if (!validate(kind, params)) return fail;
  return { ok: true, params };
}

export function parseChallenge(header: string): ParseResult {
  return parse("challenge", header);
}

export function parseCredentials(header: string): ParseResult {
  return parse("credentials", header);
}
