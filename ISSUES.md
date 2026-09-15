# Backlog

Work not in v0.1, plus the next implementation milestones. Each item has
acceptance criteria and a difficulty label. Items marked "not in v0.1" were
scoped out on purpose so the release could ship the direct handshake. The full
cross-repository backlog lives in
[pulsar-spec/ISSUES.md](https://github.com/Pulsar-agent-org/pulsar-spec/blob/main/ISSUES.md).

## Most urgent

### 1. Persistent nonce store

Difficulty: intermediate. Not in v0.1.

A durable `NonceStore` (Redis or Postgres) so a consumed nonce survives a restart
and is shared across replicas. This closes the replay window that
`InMemoryNonceStore` leaves open.

Acceptance criteria:

- A consumed nonce stays consumed across a process restart.
- Two replicas cannot both consume the same nonce.
- A test proves a replay fails after a simulated restart.
- The `NonceStore` interface is unchanged, or changed with a written note.

## Packages

### 2. Structured logging in @pulsar/server

Difficulty: good first issue.

An optional logger behind a small interface, off by default, that records
challenge issuance and each verdict without logging secrets.

Acceptance criteria:

- No output unless a logger is supplied.
- No secret key or full transaction envelope is ever logged.

### 3. Retry-with-backoff for tx_not_found in @pulsar/client

Difficulty: intermediate.

When a retry returns `tx_not_found`, poll with backoff up to a bound instead of
returning immediately, so a caller does not hand-roll the wait.

Acceptance criteria:

- Configurable maximum attempts and delay.
- A test drives a delayed-inclusion transaction to success.
- The budget is charged once, not per retry.

### 4. More adapter coverage

Difficulty: good first issue.

Dedicated request fixtures and tests for the Hono and Next.js adapters, matching
the Express coverage.

Acceptance criteria:

- 402, 200, replay, expiry, and underpayment are covered for each adapter.

### 5. Configurable nonce TTL and price-by-request examples

Difficulty: good first issue.

Document and test a price computed from the request and a non-default TTL.

Acceptance criteria:

- A test uses a price function of the request path.
- A test uses a custom TTL and asserts expiry behavior.

## Not in v0.1

### 6. LangChain adapter

Difficulty: intermediate. Not in v0.1.

An adapter exposing a paid tool to LangChain agents over `@pulsar/client`.

Acceptance criteria:

- A LangChain tool pays within a budget.
- The refusal path surfaces as a tool error.

### 7. Vercel AI SDK adapter

Difficulty: intermediate. Not in v0.1.

An adapter for the Vercel AI SDK tool interface over `@pulsar/client`.

Acceptance criteria:

- A paid tool is callable from the AI SDK.
- Budget refusals propagate as typed errors.

### 8. Payment channel client and server

Difficulty: advanced. Not in v0.1.

Once channels are specified in pulsar-spec, implement the voucher client and the
provider-side voucher verification and settlement.

Acceptance criteria:

- Vouchers are signed and verified per the spec encoding.
- A cooperative close and a dispute close both work on Testnet.

### 9. Mainnet configuration

Difficulty: intermediate. Not in v0.1.

Support the mainnet network token once the spec defines it, behind an explicit
opt-in so a misconfiguration cannot move real value by accident.

Acceptance criteria:

- Mainnet is off unless explicitly enabled.
- Asset issuers and the network passphrase are configurable.
