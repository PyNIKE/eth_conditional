import { ethers } from "ethers";
import "dotenv/config";

const RPC_URL = process.env.ETH_RPC || process.env.ETH_RPC_URL;
const WORKER_PK = process.env.WORKER_PRIVATE_KEY;
const DEMO_CONFIG = process.env.DEMO_CONFIG_MAINNET;

// ключ и значение теперь числа (uint256)
const KEY_U256 = process.env.KEY_U256 ?? "13";          // можно 13
const VALUE_U256 = process.env.VALUE_U256 ?? "123456";  // любое число

const ABI = [
  "function setConfig(uint256 key, uint256 value) external",
  "function getConfig(uint256 key) view returns (uint256)",
];

async function main() {
  if (!RPC_URL) throw new Error("Missing ETH_RPC (or ETH_RPC_URL) in .env");
  if (!WORKER_PK) throw new Error("Missing WORKER_PRIVATE_KEY in .env");
  if (!DEMO_CONFIG) throw new Error("Missing DEMO_CONFIG_MAINNET in .env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(WORKER_PK, provider);
  const contract = new ethers.Contract(DEMO_CONFIG, ABI, wallet);

  const key = BigInt(KEY_U256);
  const value = BigInt(VALUE_U256);

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