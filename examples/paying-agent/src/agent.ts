import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { Keypair, Horizon } from "@stellar/stellar-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createStellarSubmitter } from "@pulsar/client";

const HORIZON = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const ASSET = process.env.PULSAR_ASSET ?? "XLM";
const horizon = new Horizon.Server(HORIZON);

async function friendbotFund(pubkey: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${pubkey}`);
  if (!res.ok) throw new Error(`friendbot failed for ${pubkey}: ${res.status}`);
}

async function exists(pubkey: string): Promise<boolean> {
  try {
    await horizon.loadAccount(pubkey);
    return true;
  } catch {
    return false;
  }
}

// Resolve a keypair from a provided secret, or create and fund a fresh Testnet
// account so the demo runs with no configuration.
async function resolveAccount(secret: string | undefined, label: string): Promise<Keypair> {
  const kp = secret ? Keypair.fromSecret(secret) : Keypair.random();
  if (!(await exists(kp.publicKey()))) {
    console.log(`funding ${label} account ${kp.publicKey()} via friendbot`);
    await friendbotFund(kp.publicKey());
  } else {
    console.log(`using ${label} account ${kp.publicKey()}`);
  }
  return kp;
}

async function main(): Promise<void> {
  const client = await resolveAccount(process.env.PULSAR_CLIENT_SECRET, "client");
  const provider = await resolveAccount(undefined, "provider (pay_to)");

  const serverPath = fileURLToPath(new URL("../../paid-mcp-tool/src/server.ts", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", serverPath],
    env: {
      ...process.env,
      PULSAR_PAY_TO: provider.publicKey(),
      HORIZON_URL: HORIZON,
      PULSAR_ASSET: ASSET,
    },
  });

  const mcp = new Client({ name: "paying-agent", version: "0.1.0" });
  await mcp.connect(transport);

  const text = "Pulsar settles a single paid tool call as one Stellar payment.";
  const submitter = createStellarSubmitter({ secret: client.secret(), horizonUrl: HORIZON });

  // First call: no proof. The server answers with a structured challenge.
  const challenge = (await mcp.callTool({ name: "summarize", arguments: { text } })) as {
    isError?: boolean;
    structuredContent?: { pulsar?: { requirement?: Record<string, string> } };
  };
  const requirement = challenge.structuredContent?.pulsar?.requirement;
  if (!requirement) throw new Error("expected a Pulsar challenge on the first call");
  console.log(`price discovered: ${requirement.amount} ${requirement.asset}`);

  const { tx } = await submitter.submit({
    asset: requirement.asset!,
    amount: requirement.amount!,
    payTo: requirement.pay_to!,
    nonce: requirement.nonce!,
  });
  console.log(`paid on Testnet, tx ${tx}`);

  // Retry with the proof. Horizon may lag by a ledger, so poll a few times.
  let printed = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const paid = (await mcp.callTool({
      name: "summarize",
      arguments: { text, _pulsar: { tx, nonce: requirement.nonce } },
    })) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
      structuredContent?: { pulsar?: { error?: string } };
    };
    const verdictError = paid.structuredContent?.pulsar?.error;
    if (!paid.isError) {
      console.log("result:", paid.content?.map((c) => c.text).join(" "));
      printed = true;
      break;
    }
    if (verdictError === "tx_not_found") {
      await sleep(3000);
      continue;
    }
    throw new Error(`verification failed: ${verdictError ?? "unknown"}`);
  }
  if (!printed) throw new Error("transaction did not become visible in time");

  await mcp.close();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
