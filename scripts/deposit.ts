// scripts/deposit.ts
import "dotenv/config";

// берем Hardhat Runtime как any, чтобы не страдать от типов
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hre: any = require("hardhat");

const WETH_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
];

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

async function main() {
  const escrowAddr = mustEnv("ESCROW_MAINNET");
  const wethAddr = mustEnv("WETH_MAINNET");

  // yarn hardhat run scripts/deposit.ts --network mainnet -- <agreementId>
  const idStr = process.argv[2];
  if (!idStr) throw new Error("Usage: deposit.ts <agreementId>");
  const id = BigInt(idStr);

  const { ethers } = hre;

  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();

  const escrow = await ethers.getContractAt("EscrowManagerMainnetDemo", escrowAddr);
  const weth = new ethers.Contract(wethAddr, WETH_ABI, signer);

  const a = await escrow.agreements(id);
  const payer = a.payer as string;
  const amount = a.amount as bigint;

  if (payer.toLowerCase() !== signerAddr.toLowerCase()) {
    throw new Error(`This signer is not payer. payer=${payer} signer=${signerAddr}`);
  }

  const feeBps = (await escrow.protocolFeeBps()) as bigint;
  const fee = (amount * feeBps) / 10_000n;
  const total = amount + fee;

  const bal = (await weth.balanceOf(signerAddr)) as bigint;

  console.log("Deposit...");
  console.log("  escrow   :", escrowAddr);
  console.log("  weth     :", wethAddr);
  console.log("  signer   :", signerAddr);
  console.log("  id       :", id.toString());
  console.log("  amount   :", amount.toString());
  console.log("  feeBps   :", feeBps.toString());
  console.log("  fee      :", fee.toString());
  console.log("  total    :", total.toString());
  console.log("  balance  :", bal.toString());

  if (bal < total) {
    throw new Error("Not enough WETH balance for deposit total (amount + fee).");
  }

  const currentAllowance = (await weth.allowance(signerAddr, escrowAddr)) as bigint;
  if (currentAllowance < total) {
    console.log("Approving WETH...");
    const txA = await weth.approve(escrowAddr, total);
    console.log("approve tx:", txA.hash);
    await txA.wait();
  } else {
    console.log("Allowance ok, skip approve.");
  }

  console.log("Calling escrow.deposit(id)...");
  const tx = await escrow.deposit(id);
  console.log("deposit tx:", tx.hash);
  await tx.wait();

  console.log("✅ Deposited.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

