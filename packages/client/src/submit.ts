import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { nonceMemoBase64 } from "@pulsar/core";

export interface SubmitInput {
  asset: string; // "XLM" or "CODE:ISSUER"
  amount: string; // canonical decimal in whole units
  payTo: string; // destination account
  nonce: string; // challenge nonce
}

// Builds, signs, and submits the payment that settles one challenge. Returns
// the transaction hash for the Authorization retry.
export interface PaymentSubmitter {
  submit(input: SubmitInput): Promise<{ tx: string }>;
}

function toAsset(asset: string): Asset {
  if (asset === "XLM") return Asset.native();
  const [code, issuer] = asset.split(":");
  return new Asset(code!, issuer!);
}

export interface StellarSubmitterOptions {
  secret: string;
  horizonUrl?: string;
  networkPassphrase?: string;
}

// Testnet-only submitter backed by @stellar/stellar-sdk.
export function createStellarSubmitter(
  options: StellarSubmitterOptions,
): PaymentSubmitter {
  const horizonUrl =
    options.horizonUrl ?? "https://horizon-testnet.stellar.org";
  const passphrase = options.networkPassphrase ?? Networks.TESTNET;
  const server = new Horizon.Server(horizonUrl);
  const keypair = Keypair.fromSecret(options.secret);

  return {
    async submit(input: SubmitInput): Promise<{ tx: string }> {
      const account = await server.loadAccount(keypair.publicKey());
      const memoBytes = Buffer.from(nonceMemoBase64(input.nonce), "base64");
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: passphrase,
      })
        .addOperation(
          Operation.payment({
            destination: input.payTo,
            asset: toAsset(input.asset),
            amount: input.amount,
          }),
        )
        .addMemo(new Memo("hash", memoBytes))
        .setTimeout(120)
        .build();
      tx.sign(keypair);
      const res = await server.submitTransaction(tx);
      return { tx: res.hash };
    },
  };
}
