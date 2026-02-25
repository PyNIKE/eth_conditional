// scripts/completeTask.ts
import { Wallet } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";

// Явно грузим .env из корня репо (важно, если запускаешь из подпапок)
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const API_BASE_URL = process.env.API_BASE_URL || "https://api.147.182.247.224.nip.io";
const API_KEY = process.env.API_KEY || "";

const WORKER_PK =
  process.env.WORKER_PRIVATE_KEY ||
  process.env.WORKER_PK ||
  "";

function assert(condition: any, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

function isAddress(addr: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

async function readTextSafe(res: Response) {
  try {
    return await res.text();
  } catch {
    return "<failed to read body>";
  }
}

async function main() {
  assert(WORKER_PK, "Set WORKER_PRIVATE_KEY (or WORKER_PK) in .env");

  // ====== PARAMS FROM ENV (no hardcode) ======
  const chainId = 1;

  const agreementId = Number(process.env.AGREEMENT_ID || "");
  assert(Number.isFinite(agreementId) && agreementId > 0, "Set AGREEMENT_ID");

  const worker = (process.env.PAYEE || "").trim();
  assert(worker, "Set PAYEE in .env");
  assert(isAddress(worker), `Bad PAYEE address: ${worker}`);

  const target = (process.env.DEMO_CONFIG_MAINNET || "").toLowerCase();
  assert(target, "Set DEMO_CONFIG_MAINNET in .env");
  assert(isAddress(target), `Bad DEMO_CONFIG_MAINNET address: ${target}`);

  const key = Number(process.env.KEY_U256 || "");
  const value = Number(process.env.VALUE_U256 || "");
  assert(Number.isFinite(key), "Set KEY_U256");
  assert(Number.isFinite(value), "Set VALUE_U256");

  const txHash = (process.env.TX_HASH_WORK || "").toLowerCase();
  assert(txHash && txHash.startsWith("0x") && txHash.length === 66, "Set TX_HASH_WORK");

  // фиксируем completedAt (одно значение для message и POST)
  const completedAt = Math.floor(Date.now() / 1000);

  // ====== MESSAGE (ONE LINE, EXACT FORMAT) ======
  const message =
    `JiffyEscrowComplete|` +
    `chainId=${chainId}|` +
    `agreementId=${agreementId}|` +
    `target=${target}|` +
    `key=${key}|` +
    `value=${value}|` +
    `txHash=${txHash}|` +
    `completedAt=${completedAt}`;

  // ====== SIGN ======
  const wallet = new Wallet(WORKER_PK);
  const signerAddr = (await wallet.getAddress()).toLowerCase();

  assert(
    signerAddr === worker.toLowerCase(),
    `Signer mismatch: got ${signerAddr}, expected ${worker.toLowerCase()}`
  );

  const signature = await wallet.signMessage(message);

  // ====== BODY ======
  const body = {
    chainId,
    agreementId,
    worker,
    txHash,
    completedAt,
    target,
    key: String(key),
    value: String(value),
    signature,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) headers["x-api-key"] = API_KEY;

  console.log("=== Completion payload ===");
  console.log(JSON.stringify(body, null, 2));
  console.log("\n=== Message signed (ONE LINE) ===\n" + message);
  console.log("\n=== Signature ===\n" + signature);

  // ====== POST /tasks/complete ======
  const postRes = await fetch(`${API_BASE_URL}/tasks/complete`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const postText = await readTextSafe(postRes);
  console.log("\n=== POST /tasks/complete ===");
  console.log("status:", postRes.status);
  console.log("response:", postText);

  if (!postRes.ok) throw new Error("POST /tasks/complete failed");

  // ====== GET /tasks/:chainId/:agreementId ======
  const getRes = await fetch(`${API_BASE_URL}/tasks/${chainId}/${agreementId}`, {
    method: "GET",
  });

  const getText = await readTextSafe(getRes);
  console.log("\n=== GET /tasks/:chainId/:agreementId ===");
  console.log("status:", getRes.status);
  console.log("response:", getText);

  if (getRes.ok) {
    try {
      const json = JSON.parse(getText);
      console.log("\n=== Parsed status ===");
      console.log("status:", json?.status);
    } catch {
      // ignore
    }
  }
}

main().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});