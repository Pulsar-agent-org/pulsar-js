import type { NonceStore, Verifier } from "@pulsar/server";

export interface PulsarMcpOptions {
  // Price per tool call, as a decimal amount in whole units of the asset.
  prices: Record<string, string>;
  payTo: string;
  asset: string; // "XLM" or "CODE:ISSUER"
  nonceStore: NonceStore;
  verifier: Verifier;
  network?: "stellar:testnet";
  ttlSeconds?: number;
  now?: () => number;
}

// The proof a client attaches to a retried tool call.
export interface PulsarProof {
  tx: string;
  nonce: string;
}

// A minimal CallToolResult shape, structurally compatible with the MCP SDK.
export interface PulsarToolResult {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: { pulsar: unknown };
}
