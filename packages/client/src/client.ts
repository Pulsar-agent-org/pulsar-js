import { parseChallenge, serializeCredentials, toStroops } from "@pulsar/core";
import { PulsarRefusalError } from "./errors.js";
import { createStellarSubmitter, type PaymentSubmitter } from "./submit.js";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface PulsarClientOptions {
  // Signing secret (S...). Required unless a submitter is injected.
  secret?: string;
  // Per-call and lifetime caps, as decimal amounts in whole units of the asset.
  maxPerCall: string;
  maxTotal: string;
  // Hostnames the client is allowed to pay. A 402 from any other host is refused.
  allow: string[];
  horizonUrl?: string;
  networkPassphrase?: string;
  fetch?: FetchLike;
  submitter?: PaymentSubmitter;
}

export interface PulsarClient extends FetchLike {
  totalSpentStroops(): bigint;
}

function hostOf(input: string | URL | Request): string {
  const raw = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  return new URL(raw).hostname;
}

export function createPulsarClient(options: PulsarClientOptions): PulsarClient {
  const doFetch: FetchLike = options.fetch ?? ((i, init) => fetch(i, init));
  const submitter: PaymentSubmitter =
    options.submitter ??
    (() => {
      if (!options.secret) {
        throw new Error("createPulsarClient needs a secret or an injected submitter");
      }
      return createStellarSubmitter({
        secret: options.secret,
        horizonUrl: options.horizonUrl,
        networkPassphrase: options.networkPassphrase,
      });
    })();

  const maxPerCall = toStroops(options.maxPerCall);
  const maxTotal = toStroops(options.maxTotal);
  let spent = 0n;

  const pulsarFetch = (async (input, init) => {
    const first = await doFetch(input, init);
    if (first.status !== 402) return first;

    const header = first.headers.get("www-authenticate");
    if (!header) return first;
    const parsed = parseChallenge(header);
    if (!parsed.ok) return first;
    const p = parsed.params;

    const requirement = {
      asset: p.asset!,
      amount: p.amount!,
      payTo: p.pay_to!,
      nonce: p.nonce!,
    };
    const host = hostOf(input);
    const amountStroops = toStroops(requirement.amount);

    // All three checks run before anything is signed.
    if (amountStroops > maxPerCall) {
      throw new PulsarRefusalError(
        "per_call_cap",
        `call would cost ${requirement.amount}, above the per-call cap ${options.maxPerCall}`,
        host,
        requirement.amount,
      );
    }
    if (spent + amountStroops > maxTotal) {
      throw new PulsarRefusalError(
        "total_cap",
        `call would push the total past the cap ${options.maxTotal}`,
        host,
        requirement.amount,
      );
    }
    if (!options.allow.includes(host)) {
      throw new PulsarRefusalError(
        "allowlist",
        `${host} is not in the allowlist`,
        host,
        requirement.amount,
      );
    }

    const { tx } = await submitter.submit(requirement);
    spent += amountStroops;

    const headers = new Headers(init?.headers);
    headers.set("Authorization", serializeCredentials({ tx, nonce: requirement.nonce }));
    return doFetch(input, { ...init, headers });
  }) as PulsarClient;

  pulsarFetch.totalSpentStroops = () => spent;
  return pulsarFetch;
}
