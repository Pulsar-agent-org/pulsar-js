# Examples

Two runnable examples on the Stellar Testnet: an MCP server with one priced
tool, and an agent that discovers the price, pays, and prints the result.

## Prerequisites

- Node.js 20 or newer and pnpm 9 or newer.
- From the repository root, install and build the packages once:

      pnpm install
      pnpm build

No funds and no configuration are required. The agent creates and funds fresh
Testnet accounts through friendbot on first run and prints their addresses.

## Run the demo

From the repository root:

    pnpm --filter paying-agent start

The agent funds a client and a provider account, spawns the `paid-mcp-tool`
server over stdio, calls the priced `summarize` tool, receives a `402`-style
challenge, pays 0.002 XLM on Testnet with a memo of `SHA-256(nonce)`, retries
with the proof, and prints the tool output. Expected output ends with a line
like:

    price discovered: 0.002 XLM
    paid on Testnet, tx <hash>
    result: words=11 chars=62

## Run the server on its own

To drive the server from another MCP client, start it with a funded provider
account:

    PULSAR_PAY_TO=G... pnpm --filter paid-mcp-tool start

The server speaks MCP over stdio. It prices the `summarize` tool at 0.002 and
verifies each payment against Horizon Testnet before running the tool.

## Configuration

Both examples read the same variables as the repository `.env.example`.
`PULSAR_CLIENT_SECRET` reuses an existing funded client account instead of
creating one; `PULSAR_PAY_TO` sets the provider account; `HORIZON_URL` and
`PULSAR_ASSET` override the Testnet defaults.
