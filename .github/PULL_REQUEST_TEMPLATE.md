## What and why

Describe the change and the problem it solves. Link the issue it closes.

## Checklist

- [ ] The change is a single logical step with a Conventional Commit message.
- [ ] `pnpm build`, `pnpm test`, `pnpm lint`, and `pnpm typecheck` pass.
- [ ] A change near replay, budgets, or verification order adds or updates a test.
- [ ] `@pulsar/core` still passes the pinned conformance vectors.
- [ ] No secret keys, and no mainnet configuration, are introduced.
- [ ] `conformance/` is untouched unless the pin in `PIN.json` is bumped with it.
- [ ] A dependent pull request in pulsar-spec or pulsar-facilitator is linked below.

## Linked pull requests

List any dependent pull request in another repository, or write "none".
