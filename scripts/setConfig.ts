import { ethers } from "ethers";
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
  KEY=17 VALUE=777 npx hardhat run scripts/setConfig.ts --network mainnet

  # Option B (works if args reach node process)
  npx hardhat run scripts/setConfig.ts --network mainnet -- --key <u256> --value <u256>

Args:
  --key     uint256 key
  --value   uint256 value

Env:
  KEY or KEY_U256
  VALUE or VALUE_U256
  ETH_RPC or ETH_RPC_URL (required)
  WORKER_PRIVATE_KEY (required)
  DEMO_CONFIG_MAINNET (required)
`);
}

const RPC_URL = process.env.ETH_RPC || process.env.ETH_RPC_URL;
const WORKER_PK = process.env.WORKER_PRIVATE_KEY;
const DEMO_CONFIG = process.env.DEMO_CONFIG_MAINNET;

const ABI = [
  "function setConfig(uint256 key, uint256 value) external",
  "function getConfig(uint256 key) view returns (uint256)",
];

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  if (!RPC_URL) throw new Error("Missing ETH_RPC (or ETH_RPC_URL) in .env");
  if (!WORKER_PK) throw new Error("Missing WORKER_PRIVATE_KEY in .env");
  if (!DEMO_CONFIG) throw new Error("Missing DEMO_CONFIG_MAINNET in .env");

  // ✅ CLI OR ENV (Hardhat-friendly)
  const keyStr = getArg("key") || process.env.KEY || process.env.KEY_U256;
  const valStr = getArg("value") || process.env.VALUE || process.env.VALUE_U256;

  if (!keyStr) throw new Error("Missing --key (or set env KEY/KEY_U256)");
  if (!valStr) throw new Error("Missing --value (or set env VALUE/VALUE_U256)");

  const key = BigInt(keyStr);
  const value = BigInt(valStr);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(WORKER_PK, provider);
  const contract = new ethers.Contract(DEMO_CONFIG, ABI, wallet);

  console.log("Worker:", wallet.address);
  console.log("DemoConfig:", DEMO_CONFIG);
  console.log("setConfig:", { key: key.toString(), value: value.toString() });

  const tx = await contract.setConfig(key, value);
  console.log("txHash_work =", tx.hash);

  const receipt = await tx.wait();
  console.log("Mined block =", receipt.blockNumber);

  const got: bigint = await contract.getConfig(key);
  console.log("getConfig(key) =", got.toString());

  if (got !== value) {
    throw new Error(`Value mismatch! expected=${value} got=${got}`);
  }

  console.log("✅ Config successfully written!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});