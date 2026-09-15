import { paywall } from "./paywall.js";
import type { PaywallOptions } from "./types.js";

type RouteHandler = (req: Request) => Response | Promise<Response>;

// Wrap a Next.js App Router route handler. The wrapped handler runs only after
// a payment verifies; otherwise the challenge or error response is returned.
export function withPulsarRoute(handler: RouteHandler, options: PaywallOptions): RouteHandler {
  return async (req: Request): Promise<Response> => {
    const result = await paywall(options, {
      method: req.method,
      path: new URL(req.url).pathname,
      authorization: req.headers.get("authorization") ?? undefined,
    });
    if (result.kind === "pass") return handler(req);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: result.headers,
    });
  };
}
