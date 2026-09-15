import type { RequestHandler } from "express";
import { paywall } from "./paywall.js";
import type { PaywallOptions } from "./types.js";

// Express middleware. Place it before the handler for a paid route; a verified
// request calls next(), anything else is answered here.
export function paywallExpress(options: PaywallOptions): RequestHandler {
  return (req, res, next) => {
    void paywall(options, {
      method: req.method,
      path: req.originalUrl ?? req.path,
      authorization: req.header("authorization") ?? undefined,
    })
      .then((result) => {
        if (result.kind === "pass") return next();
        for (const [name, value] of Object.entries(result.headers)) {
          res.setHeader(name, value);
        }
        res.status(result.status).json(result.body);
      })
      .catch(next);
  };
}
