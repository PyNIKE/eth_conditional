import { Wallet } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function getArg(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split("=", 2)[1];
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

function usage() {
  console.log(`Usage:
  # Option A (preferred with hardhat): use ENV
  ID=17 KEY=17 VALUE=777 TX=0x... npx hardhat run scripts/completeTask.ts --network mainnet

  # Option B (works if args reach node process)
  npx hardhat run scripts/completeTask.ts --network mainnet -- --id <agreementId> --key <u256> --value <u256> --tx <0x...>

Args:
  --id     agreementId
  --key    uint256 key
  --value  uint256 value
  --tx     txHash_work (0x + 64 hex)

Env:
  ID or AGREEMENT_ID
  KEY or KEY_U256
  VALUE or VALUE_U256
  TX or TX_HASH_WORK

  API_BASE_URL (optional)
  API_KEY (optional)
  WORKER_PRIVATE_KEY (required)
  PAYEE (required worker address)
  DEMO_CONFIG_MAINNET (required)
`);
}

const API_BASE_URL = process.env.API_BASE_URL || "https://api.147.182.247.224.nip.io";
const API_KEY = process.env.API_KEY || "";

const WORKER_PK = process.env.WORKER_PRIVATE_KEY || process.env.WORKER_PK || "";

function assert(condition: any, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

function isAddress(addr: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}
function isTxHash(h: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(h);
}

async function readTextSafe(res: Response) {
  try {
    return await res.text();
  } catch {
    return "<failed to read body>";
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  assert(WORKER_PK, "Set WORKER_PRIVATE_KEY in .env");
  const chainId = 1;

  // ✅ CLI OR ENV (Hardhat-friendly)
  const idStr = getArg("id") || process.env.ID || process.env.AGREEMENT_ID;
  const keyStr = getArg("key") || process.env.KEY || process.env.KEY_U256;
  const valStr = getArg("value") || process.env.VALUE || process.env.VALUE_U256;
  const txStr = getArg("tx") || process.env.TX || process.env.TX_HASH_WORK;

  if (!idStr) throw new Error("Missing --id (or set env ID/AGREEMENT_ID)");
  if (!keyStr) throw new Error("Missing --key (or set env KEY/KEY_U256)");
  if (!valStr) throw new Error("Missing --value (or set env VALUE/VALUE_U256)");
  if (!txStr) throw new Error("Missing --tx (or set env TX/TX_HASH_WORK)");

  const agreementId = Number(idStr);
  if (!Number.isFinite(agreementId) || agreementId <= 0) throw new Error("Bad id (agreementId)");

  const worker = (process.env.PAYEE || "").trim();
  assert(worker, "Set PAYEE in .env");
  assert(isAddress(worker), `Bad PAYEE address: ${worker}`);

  const target = (process.env.DEMO_CONFIG_MAINNET || "").toLowerCase();
  assert(target, "Set DEMO_CONFIG_MAINNET in .env");
  assert(isAddress(target), `Bad DEMO_CONFIG_MAINNET address: ${target}`);

  // keep as decimal strings (safe for API + message)
  const key = BigInt(keyStr).toString();
  const value = BigInt(valStr).toString();

  const txHash = txStr.toLowerCase();
  assert(isTxHash(txHash), "Bad txHash (expected 0x + 64 hex chars)");

  const completedAt = Math.floor(Date.now() / 1000);

  const message =
    `JiffyEscrowComplete|` +
    `chainId=${chainId}|` +
    `agreementId=${agreementId}|` +
    `target=${target}|` +
    `key=${key}|` +
    `value=${value}|` +
    `txHash=${txHash}|` +
    `completedAt=${completedAt}`;

  const wallet = new Wallet(WORKER_PK);
  const signerAddr = (await wallet.getAddress()).toLowerCase();

  assert(
    signerAddr === worker.toLowerCase(),
    `Signer mismatch: got ${signerAddr}, expected ${worker.toLowerCase()}`
  );

  const signature = await wallet.signMessage(message);

  const body = {
    chainId,
    agreementId,
    worker,
    txHash,
    completedAt,
    target,
    key,
    value,
    signature,
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["x-api-key"] = API_KEY;

  console.log("=== Completion payload ===");
  console.log(JSON.stringify(body, null, 2));
  console.log("\n=== Message signed (ONE LINE) ===\n" + message);
  console.log("\n=== Signature ===\n" + signature);

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
    } catch {}
  }
}

main().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});