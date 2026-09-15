# Security policy

## Reporting

Report privately. Do not open a public issue for a suspected vulnerability. Use
GitHub's private vulnerability reporting on this repository (the Security tab,
"Report a vulnerability"). If that is unavailable, email the maintainers listed
on the organization profile and mark the subject as a security report.

Include the package and version, a description of the flaw, and a concrete
reproduction. Expect an acknowledgement within a few days. Please allow time for
a fix and a released patch before public disclosure.

## Sensitive surfaces

- The client signing path. `@pulsar/client` must check the per-call cap, the
  running total, and the host allowlist before it signs or submits any
  transaction. A path that signs without those checks is the most serious bug
  here.
- The nonce store. `NonceStore.consume` must be atomic and single-use. A store
  that lets a consumed nonce verify again breaks replay protection.
- The verifier. `@pulsar/core` verification must apply the spec checks in order
  and fail closed; a verdict of `valid` without confirmed on-chain settlement is
  a vulnerability.
- Amount handling. Amounts must be compared in integer stroops. A float on any
  payment path is a defect.
- Secret handling. Secret keys come from the environment and must never be
  logged or committed.

## Known limitation of the default nonce store

`InMemoryNonceStore` keeps consumed nonces only in process memory. A restart
forgets them, so a proof replayed within the original expiry window could verify
a second time, and it must not run behind more than one replica. A durable,
shared nonce store is the most urgent open task; see `ISSUES.md`. Do not treat
the in-memory store as sufficient for production.

## Scope

In scope: the four published packages and their verification, budget, and
nonce-store logic. Protocol-level issues belong in
[pulsar-spec](https://github.com/Pulsar-agent-org/pulsar-spec). Out of scope:
mainnet configuration, which v0.1 does not support.
