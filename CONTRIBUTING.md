# Contributing to pulsar-js

This repository is the TypeScript implementation of Pulsar. You do not need to
know Stellar to contribute; the parts that touch a blockchain are explained
below, and the examples create and fund Testnet accounts for you.

## What this repository is, and the other two

Pulsar lets an HTTP endpoint or an MCP tool charge a small amount per call. A
server answers an unpaid request with `402 Payment Required` and a challenge;
the caller pays a few tenths of a cent in USDC or XLM on the Stellar Testnet and
retries with a proof of payment.

Pulsar is three repositories in the `Pulsar-agent-org` organization, and they
depend on each other in one direction only:

    pulsar-spec  ->  pulsar-js  ->  pulsar-facilitator

- **pulsar-spec**: the normative protocol, the threat model, and the conformance
  vectors. This repository vendors those vectors under `conformance/` and pins
  the version in `conformance/PIN.json`.
- **pulsar-js** (here): four npm packages built from one repository.
- **pulsar-facilitator**: a stateless verify-and-settle service, built on
  `@pulsar/core`.

`@pulsar/core` depends on the spec. Nothing in this repository may make the spec
depend on an implementation. Protocol changes belong in pulsar-spec, behind a
written proposal, not here.

## The 402 handshake in plain language

A Stellar payment is an ordinary transaction that moves an asset from one
account (a `G...` address) to another and can carry a small tag called a memo.
Pulsar uses the memo to bind a payment to a specific request.

    GET /tools/summarize
    <- 402 Payment Required
       WWW-Authenticate: Pulsar network="stellar:testnet", asset="XLM",
         amount="0.002", pay_to="GD4R...", nonce="90aa...", expires="1789..."

    The client sends 0.002 XLM to pay_to, memo = SHA-256 of the nonce, and retries:

    GET /tools/summarize
       Authorization: Pulsar tx="d2fb...", nonce="90aa..."
    <- 200 OK

The nonce is single-use and expires. Amounts are compared in stroops, the
indivisible unit of a Stellar asset, never as floating-point numbers.

## Repository map

    packages/core      @pulsar/core: pure protocol logic, no network access.
    packages/server    @pulsar/server: paywall plus Express, Hono, Next adapters.
    packages/client    @pulsar/client: budget-capped paying fetch client.
    packages/mcp       @pulsar/mcp: withPulsar payment gate for MCP tools.
    examples/          A paid MCP tool and a paying agent that run on Testnet.
    conformance/       Vendored pulsar-spec vectors and the pinned version.
    docs/mcp.md        How the MCP payment challenge travels as a tool error.

## Setup

Prerequisites: Node.js 20 or newer, pnpm 9 or newer (`npm install -g pnpm`),
git, and a GitHub account. No Stellar account and no funds; friendbot funds test
accounts for free on the Testnet.

    git clone https://github.com/Pulsar-agent-org/pulsar-js.git
    cd pulsar-js
    pnpm install
    pnpm build
    pnpm test
    pnpm --filter paying-agent start   # pays 0.002 XLM on Testnet and prints the result

The last command creates and funds fresh Testnet accounts, starts the paid MCP
tool, pays per call, and prints the tool output.

## Where to start

Unclaimed work, easiest first. Comment on an issue to claim it.

1. Widen test coverage for the Hono and Next.js adapters with their own request
   fixtures. Difficulty: good first issue.
2. Add a structured logger to `@pulsar/server` behind a small interface, off by
   default. Difficulty: good first issue.
3. Add retry-with-backoff for `tx_not_found` inside `@pulsar/client` so a caller
   does not poll by hand. Difficulty: intermediate.
4. Implement the **persistent nonce store**: a durable, shared `NonceStore` so a
   consumed nonce survives a restart and cannot be spent twice across replicas.
   This is the most urgent gap, because `InMemoryNonceStore` forgets consumed
   nonces on restart. Difficulty: intermediate.
5. Add a LangChain or Vercel AI SDK adapter over `@pulsar/client`. Difficulty:
   intermediate.
6. Once **payment channels** are specified in pulsar-spec, implement the voucher
   client and server. This is the largest piece of future work and starts with a
   spec proposal, not code here. Difficulty: advanced.

The full backlog, including items scoped out of v0.1, is in `ISSUES.md`.

## Invariants a reviewer will send a pull request back for

- Weakening replay protection. A nonce is single-use and expires. A change near
  this must ship a test proving a replayed proof fails.
- A signing path in `@pulsar/client` that skips `maxPerCall`, `maxTotal`, or the
  host allowlist. This is the most serious class of bug in this repository.
- An amount handled as a float, or any amount path that is not integer stroops.
- Network access added to `@pulsar/core`. The core stays pure; callers inject a
  Horizon client.
- Serving a paid response, or running a paid tool, without a verified, freshly
  consumed nonce. Fail closed.
- Editing a vector in `conformance/` by hand. Vectors come from pulsar-spec; bump
  the pin instead.

## Code style and CI

TypeScript, ESM, Node 20. Formatting is Prettier. The exact commands CI runs:

    pnpm install
    pnpm build
    pnpm test
    pnpm lint
    pnpm typecheck

Run them locally before you push. `pnpm format` fixes formatting. Follow
Conventional Commits: `feat(core): ...`, `fix(server): ...`, `test(client): ...`,
`docs: ...`, `chore: ...`.

## Pull request checklist

- [ ] The change is a single logical step with a Conventional Commit message.
- [ ] `pnpm build`, `pnpm test`, `pnpm lint`, and `pnpm typecheck` pass.
- [ ] A change near replay, budgets, or verification order adds or updates a test.
- [ ] `@pulsar/core` still passes the pinned conformance vectors.
- [ ] No secret keys, and no mainnet configuration, are introduced.
- [ ] `conformance/` is untouched unless the pin in `PIN.json` is bumped with it.

## Releases

All four packages share one version and are released together. v0.1 ships as
`0.1.0-rc.1`. A release builds every package, runs the suite, and publishes with
`pnpm -r publish` under the `@pulsar` scope. A version bump is deliberate and
matched to the pinned spec version when protocol behavior changes.

## Security reporting

Report vulnerabilities privately through GitHub's private vulnerability reporting
on this repository, not as a public issue. The sensitive surfaces are the
client's signing path and budget checks, the nonce store's single-use guarantee,
and the verifier's on-chain checks. Full instructions are in `SECURITY.md`.

## Community norms

Protocol changes need a written proposal and a maintainer sign-off in
pulsar-spec before the behavior changes here. Implementation improvements,
tests, adapters, and documentation do not need a proposal. Be precise and be
kind; a review that pushes for an exact test is doing its job.
