import type { Context, Next } from "hono";
import { paywall } from "./paywall.js";
import type { PaywallOptions } from "./types.js";

// Hono middleware. A verified request continues to the handler; anything else
// is answered here.
export function paywallHono(options: PaywallOptions) {
  return async (c: Context, next: Next) => {
    const result = await paywall(options, {
      method: c.req.method,
      path: c.req.path,
      authorization: c.req.header("authorization") ?? undefined,
    });
    if (result.kind === "pass") {
      await next();
      return;
    }
    for (const [name, value] of Object.entries(result.headers)) {
      c.header(name, value);
    }
    return c.json(result.body, result.status as 400 | 402);
  };
}
