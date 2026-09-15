import { z, type ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { guardToolCall } from "./guard.js";
import type { PulsarMcpOptions } from "./types.js";

// The optional proof a client attaches on a retry. Merged into every priced
// tool's input schema so the SDK does not strip it during validation.
const PROOF_SHAPE: ZodRawShape = {
  _pulsar: z.object({ tx: z.string(), nonce: z.string() }).optional(),
};

export interface PaidToolConfig {
  title?: string;
  description?: string;
  inputSchema?: ZodRawShape;
  outputSchema?: ZodRawShape;
  annotations?: Record<string, unknown>;
}

type ToolHandler = (
  args: Record<string, unknown>,
  extra: unknown,
) => unknown | Promise<unknown>;

// Wrap an McpServer so tools registered through the returned object are gated by
// Pulsar payments. A priced tool that is called without a valid proof returns a
// structured challenge the client can act on, pay, and retry.
export function withPulsar(server: McpServer, options: PulsarMcpOptions) {
  return {
    server,
    registerTool(name: string, config: PaidToolConfig, handler: ToolHandler) {
      const inputSchema: ZodRawShape = {
        ...(config.inputSchema ?? {}),
        ...PROOF_SHAPE,
      };
      // The SDK's registerTool generics are keyed on the schema shape; the guard
      // works on plain objects, so we bridge with a loose handler here.
      (
        server.registerTool as unknown as (
          n: string,
          c: unknown,
          cb: unknown,
        ) => unknown
      )(
        name,
        { ...config, inputSchema },
        async (args: Record<string, unknown>, extra: unknown) => {
          const guarded = await guardToolCall(options, name, args);
          if (!guarded.proceed) return guarded.result;
          return handler(guarded.args, extra);
        },
      );
      return server;
    },
  };
}
