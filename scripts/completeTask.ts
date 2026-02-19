import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

function buildMessage(params: {
  chainId: number;
  agreementId: number;
  txHash: string;
  completedAt: number;
}) {
  const { chainId, agreementId, txHash, completedAt } = params;
  return `JiffyEscrowComplete|chainId=${chainId}|agreementId=${agreementId}|txHash=${txHash}|completedAt=${completedAt}`;
}

async function main() {
  // === Inputs ===
  const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:8787").replace(/\/$/, "");
  const chainId = Number(process.env.CHAIN_ID || "1");

  // agreementId можно передать через CLI: yarn hardhat run ... -- 123 0xTxHash
  const agreementIdArg = process.argv[2];
  const txHashArg = process.argv[3];

  if (!agreementIdArg) throw new Error("Usage: completeTask.ts <agreementId> <txHash>");
  if (!txHashArg) throw new Error("Usage: completeTask.ts <agreementId> <txHash>");

  const agreementId = Number(agreementIdArg);
  const txHash = txHashArg;

  if (!Number.isFinite(agreementId) || agreementId < 0) throw new Error("Bad agreementId");
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("Bad txHash (expected 0x + 64 hex chars)");

  // Worker key (исполнитель B)
  // Лучше завести отдельную переменную, чтобы не путать с деплойером:
  // WORKER_PRIVATE_KEY=0x...
  const WORKER_PRIVATE_KEY = mustEnv("WORKER_PRIVATE_KEY");
  const wallet = new ethers.Wallet(WORKER_PRIVATE_KEY);

  const completedAt = Math.floor(Date.now() / 1000);
  const message = buildMessage({ chainId, agreementId, txHash, completedAt });

  // EIP-191 signature (signMessage)
  const signature = await wallet.signMessage(message);

  const payload = {
    chainId,
    agreementId,
    worker: wallet.address,
    txHash,
    completedAt,
    signature,
  };

  console.log("POST", `${API_BASE_URL}/tasks/complete`);
  console.log("worker:", wallet.address);
  console.log("message:", message);
  console.log("signature:", signature);

  const resp = await fetch(`${API_BASE_URL}/tasks/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`API error ${resp.status}: ${text}`);
  }

  console.log("✅ API response:", text);

  // quick GET check
  const check = await fetch(`${API_BASE_URL}/tasks/${chainId}/${agreementId}`);
  console.log("GET check:", await check.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
