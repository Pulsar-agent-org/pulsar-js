import { Horizon } from "@stellar/stellar-sdk";
import {
  verifyPayment,
  type ResolvedTransaction,
  type HorizonClient,
} from "@pulsar/core";
import type { Verifier } from "./types.js";

function assetString(op: {
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
}): string {
  if (op.asset_type === "native" || op.asset_type === undefined) return "XLM";
  return `${op.asset_code}:${op.asset_issuer}`;
}

// A HorizonClient backed by @stellar/stellar-sdk. It resolves a transaction and
// its payment operations into the shape core verifies. Testnet only.
export function createHorizonClient(horizonUrl: string): HorizonClient {
  const server = new Horizon.Server(horizonUrl);
  return {
    async getTransaction(hash: string): Promise<ResolvedTransaction | null> {
      try {
        const tx = await server.transactions().transaction(hash).call();
        const opsPage = await server
          .operations()
          .forTransaction(hash)
          .limit(200)
          .call();
        const operations = opsPage.records
          .filter((op) => op.type === "payment")
          .map((op) => {
            const p = op as unknown as {
              to: string;
              amount: string;
              asset_type: string;
              asset_code?: string;
              asset_issuer?: string;
            };
            return {
              type: "payment",
              destination: p.to,
              asset: assetString(p),
              amount: p.amount,
            };
          });

        return {
          found: true,
          successful: tx.successful,
          memoType: (tx.memo_type as ResolvedTransaction["memoType"]) ?? "none",
          memo: tx.memo ?? "",
          operations,
        };
      } catch (err: unknown) {
        // A 404 means the transaction is not yet included on the network.
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        if (status === 404) {
          return {
            found: false,
            successful: false,
            memoType: "none",
            memo: "",
            operations: [],
          };
        }
        throw err;
      }
    },
  };
}

// A verifier that resolves through Horizon and applies core verification.
export function createHorizonVerifier(horizonUrl: string): Verifier {
  const horizon = createHorizonClient(horizonUrl);
  return {
    async verify(input) {
      const transaction = await horizon.getTransaction(input.proof.tx);
      return verifyPayment({ ...input, transaction });
    },
  };
}
