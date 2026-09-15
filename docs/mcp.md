# Paying for MCP tools

`@pulsar/mcp` gates Model Context Protocol tools behind a Pulsar payment. HTTP
has a `402` status and a `WWW-Authenticate` header to carry a challenge; a tool
call has neither, so the challenge travels as a structured tool error the client
can read, act on, and retry.

## Registering a paid tool

`withPulsar` wraps an `McpServer` and returns an object whose `registerTool`
behaves like the SDK's, but charges for the tools you price.

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withPulsar } from "@pulsar/mcp";
import {
  InMemoryNonceStore,
  createHorizonVerifier,
} from "@pulsar/server";

const server = new McpServer({ name: "paid-tools", version: "0.1.0" });

const paid = withPulsar(server, {
  prices: { summarize: "0.002" },
  payTo: process.env.PULSAR_PAY_TO!,
  asset: "XLM",
  nonceStore: new InMemoryNonceStore(),
  verifier: createHorizonVerifier("https://horizon-testnet.stellar.org"),
});

paid.registerTool(
  "summarize",
  { description: "Summarize text", inputSchema: { text: z.string() } },
  async ({ text }) => ({
    content: [{ type: "text", text: `Summary of ${String(text).length} chars` }],
  }),
);
```

A tool named in `prices` is charged; any other tool registered through the same
object runs free.

## The challenge as a tool error

When a priced tool is called without a valid proof, the wrapped handler returns
an error result instead of running:

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "Pulsar payment required: ..." }],
  "structuredContent": {
    "pulsar": {
      "kind": "challenge",
      "error": "payment_required",
      "challenge": "Pulsar network=\"stellar:testnet\", asset=\"XLM\", ...",
      "requirement": {
        "network": "stellar:testnet",
        "asset": "XLM",
        "amount": "0.002",
        "pay_to": "G...",
        "nonce": "...",
        "expires": "..."
      }
    }
  }
}
```

`structuredContent.pulsar` is the machine-readable form. `requirement` holds the
same fields a `WWW-Authenticate: Pulsar` header would, and `challenge` is that
header value verbatim, so a client can reuse HTTP-side parsing.

## Paying and retrying

The client reads the requirement, pays on Stellar with a memo of
`SHA-256(nonce)` (exactly as in the HTTP flow), and calls the tool again with a
`_pulsar` field carrying the proof:

```ts
const result = await callTool("summarize", {
  text: "...",
  _pulsar: { tx: "<transaction hash>", nonce: "<nonce from the challenge>" },
});
```

`withPulsar` merges an optional `_pulsar` field into every priced tool's input
schema, so the proof passes validation. On a valid, unused payment the field is
stripped and the real handler runs with the original arguments. A replayed nonce
returns `{ "pulsar": { "kind": "error", "error": "nonce_used" } }`; an expired or
unknown nonce returns a fresh challenge the client can pay against.

## Invariants

The gate fails closed: a priced tool runs only after a payment verifies and its
nonce is consumed. The nonce store and verifier are the same components the HTTP
paywall uses, so replay protection, amount checks, and verification order are
identical across transports.
