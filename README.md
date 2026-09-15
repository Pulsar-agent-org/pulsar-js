# pulsar-js

TypeScript implementation of Pulsar, a pay-per-call payment layer for HTTP APIs,
AI agents, and MCP servers, settled in USDC or XLM on the Stellar Testnet. A
server answers an unpaid request with `402 Payment Required` and a challenge; a
client pays a few tenths of a cent on Stellar and retries with a proof of
payment.

This repository holds four packages built from one release cycle. It implements
the protocol specified in
[pulsar-spec](https://github.com/Pulsar-agent-org/pulsar-spec) and depends on it;
the dependency never runs the other way.

    pulsar-spec  ->  pulsar-js  ->  pulsar-facilitator

## Status

Early and pre-release. Testnet only. Unaudited. The packages build, the tests and
the conformance suite pass, and the Testnet demo runs, but the packages are not
yet published to npm and nothing here is ready for real value.

## Packages

- **@pulsar/core**: pure protocol logic. Header serialization and parsing, nonce
  generation and validation, integer-stroop amounts, and
  `verifyPayment(proof, requirement)`. No network access of its own; it passes
  every vector in the pinned `pulsar-spec` conformance suite.
- **@pulsar/server**: `paywall(...)` written once as a framework-agnostic
  function, with Express, Hono, and Next.js adapters, plus an in-memory
  `NonceStore` and a Horizon-backed verifier.
- **@pulsar/client**: `createPulsarClient(...)` returning a fetch-compatible
  function that pays a `402` automatically within a budget and refuses to exceed
  a per-call cap, a running total, or a host allowlist.
- **@pulsar/mcp**: `withPulsar(...)`, which gates Model Context Protocol tools;
  the challenge travels as a structured tool error. See `docs/mcp.md`.

## Charge an existing endpoint

```ts
import express from "express";
import { InMemoryNonceStore, createHorizonVerifier } from "@pulsar/server";
import { paywallExpress } from "@pulsar/server/express";

const app = express();
app.get(
  "/paid",
  paywallExpress({
    price: "0.002",
    payTo: process.env.PULSAR_PAY_TO!,
    asset: "XLM",
    nonceStore: new InMemoryNonceStore(),
    verifier: createHorizonVerifier("https://horizon-testnet.stellar.org"),
  }),
  (_req, res) => res.json({ summary: "..." }),
);
```

The same options object drives the Hono and Next.js adapters
(`@pulsar/server/hono`, `@pulsar/server/next`).

## Pay automatically within a budget

```ts
import { createPulsarClient } from "@pulsar/client";

const pay = createPulsarClient({
  secret: process.env.PULSAR_CLIENT_SECRET!,
  maxPerCall: "0.01",
  maxTotal: "1",
  allow: ["api.example.com"],
});

const res = await pay("https://api.example.com/paid");
```

`pay` is a `fetch`-compatible function. It pays a `402`, retries once with the
proof, and throws a typed `PulsarRefusalError` before signing anything if a cap
or the allowlist would be violated.

## Try it on Testnet

    pnpm install
    pnpm build
    pnpm --filter paying-agent start

The agent creates and funds fresh Testnet accounts, starts a paid MCP tool, pays
0.002 XLM per call, and prints the result. See `examples/README.md`.

## Development

    pnpm install
    pnpm build        # build all packages with tsup
    pnpm test         # run unit and conformance tests
    pnpm lint         # prettier --check
    pnpm typecheck    # tsc --noEmit across packages

`@pulsar/core` runs the vendored `pulsar-spec` vectors in
`conformance/`, pinned in `conformance/PIN.json`. See `CONTRIBUTING.md`.

## Versions and license

All four packages are versioned at `0.1.0-rc.1` and are not yet published to npm.
Apache-2.0. See `LICENSE`.
