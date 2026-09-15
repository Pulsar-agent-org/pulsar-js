import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { withPulsar } from "@pulsar/mcp";
import { InMemoryNonceStore, createHorizonVerifier } from "@pulsar/server";

// The stdio transport speaks the MCP protocol over stdout, so this process must
// never write anything else there. Diagnostics go to stderr.
const payTo = process.env.PULSAR_PAY_TO;
if (!payTo) {
  process.stderr.write("PULSAR_PAY_TO is required (a funded Testnet G... account)\n");
  process.exit(1);
}
const horizon = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const asset = process.env.PULSAR_ASSET ?? "XLM";

const server = new McpServer({ name: "pulsar-paid-tools", version: "0.1.0" });

const paid = withPulsar(server, {
  prices: { summarize: "0.002" },
  payTo,
  asset,
  nonceStore: new InMemoryNonceStore(),
  verifier: createHorizonVerifier(horizon),
});

paid.registerTool(
  "summarize",
  {
    description: "Return a word and character count for the given text",
    inputSchema: { text: z.string() },
  },
  async (args) => {
    const text = String(args.text ?? "");
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { content: [{ type: "text", text: `words=${words} chars=${text.length}` }] };
  },
);

await server.connect(new StdioServerTransport());
process.stderr.write("paid-mcp-tool ready on stdio\n");
