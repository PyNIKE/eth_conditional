// scripts/deploy-mainnet.ts
import "dotenv/config";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function opt(name: string): string | undefined {
  const v = process.env[name];
  const t = v?.trim();
  return t && t.length ? t : undefined;
}

async function main() {
  const [deployer]: HardhatEthersSigner[] = await ethers.getSigners();

  const owner = req("OWNER");
  const weth = req("WETH_MAINNET");
  const forwarder = opt("KEYSTONE_FORWARDER_MAINNET");

  const feeBps = Number(opt("FEE_BPS") ?? "0");
  const feeRecipient = opt("FEE_RECIPIENT") ?? owner;

  console.log("\n=== DEPLOY / REUSE CONDITIONAL ESCROW (MAINNET) ===");
  console.log("Deployer:", deployer.address);
  console.log("Owner:", owner);
  console.log("WETH:", weth);
  console.log("Forwarder:", forwarder ?? "<not set>");
  console.log("Fee:", { feeBps, feeRecipient });

  // -------------------------------------------------------
  // 1) TimeCondition (deploy once or reuse from .env)
  // -------------------------------------------------------
  let timeCondAddr = opt("TIME_CONDITION_MAINNET");

  if (!timeCondAddr) {
    console.log("\n--- 1) Deploy TimeCondition ---");
    const TimeCondition = await ethers.getContractFactory("TimeCondition", deployer);
    const timeCond = await TimeCondition.deploy();
    console.log("Deploy tx:", timeCond.deploymentTransaction()?.hash);
    await timeCond.waitForDeployment();
    timeCondAddr = await timeCond.getAddress();
    console.log("✅ TimeCondition =", timeCondAddr);
  } else {
    console.log("\n--- 1) Reuse TimeCondition ---");
    console.log("✅ TimeCondition =", timeCondAddr);
  }

  // -------------------------------------------------------
  // 2) EscrowManagerMainnetDemo (deploy once or reuse)
  // -------------------------------------------------------
  let escrowAddr = opt("ESCROW_MAINNET");

  const escrow =
    escrowAddr
      ? await ethers.getContractAt("EscrowManagerMainnetDemo", escrowAddr, deployer)
      : undefined;

  if (!escrowAddr) {
    console.log("\n--- 2) Deploy EscrowManagerMainnetDemo ---");
    const Escrow = await ethers.getContractFactory("EscrowManagerMainnetDemo", deployer);
    const deployed = await Escrow.deploy(weth, owner);
    console.log("Deploy tx:", deployed.deploymentTransaction()?.hash);
    await deployed.waitForDeployment();
    escrowAddr = await deployed.getAddress();
    console.log("✅ EscrowManagerMainnetDemo =", escrowAddr);
  } else {
    console.log("\n--- 2) Reuse EscrowManagerMainnetDemo ---");
    console.log("✅ EscrowManagerMainnetDemo =", escrowAddr);
  }

  // contract instance (always available after this point)
  const escrowContract = escrowAddr
    ? await ethers.getContractAt("EscrowManagerMainnetDemo", escrowAddr, deployer)
    : (() => {
        throw new Error("ESCROW_MAINNET unresolved");
      })();

  // -------------------------------------------------------
  // 3) Ensure conditionImpl[1] = TimeCondition
  // -------------------------------------------------------
  console.log("\n--- 3) Ensure conditionImpl[1] = TimeCondition ---");
  const current = await escrowContract.conditionImpl(1);
  if (current.toLowerCase() !== timeCondAddr.toLowerCase()) {
    const tx = await escrowContract.setConditionImpl(1, timeCondAddr);
    console.log("setConditionImpl tx:", tx.hash);
    await tx.wait();
    console.log("✅ conditionImpl[1] updated");
  } else {
    console.log("✅ already set");
  }

  // -------------------------------------------------------
  // 4) Fee config (optional)
  // -------------------------------------------------------
  if (feeBps !== 0 || feeRecipient.toLowerCase() !== owner.toLowerCase()) {
    console.log("\n--- 4) Set fee config ---");
    const txFee = await escrowContract.setFeeConfig(feeBps, feeRecipient);
    console.log("setFeeConfig tx:", txFee.hash);
    await txFee.wait();
    console.log("✅ fee config set");
  } else {
    console.log("\n--- 4) Fee config skipped (defaults OK) ---");
  }

  // -------------------------------------------------------
  // 5) EscrowExecReceiver (optional; deploy once or reuse)
  // -------------------------------------------------------
  let receiverAddr = opt("RECEIVER_MAINNET");

  if (!forwarder) {
    console.log("\n--- 5) Receiver skipped (KEYSTONE_FORWARDER_MAINNET not set) ---");
  } else if (!receiverAddr) {
    console.log("\n--- 5) Deploy EscrowExecReceiver ---");
    const Receiver = await ethers.getContractFactory("EscrowExecReceiver", deployer);

    const fwd: string = forwarder; // <- гарантированно string
    const esc: string = escrowAddr; // <- гарантированно string
    const receiver = await Receiver.deploy(fwd, esc);

    console.log("Deploy tx:", receiver.deploymentTransaction()?.hash);
    await receiver.waitForDeployment();
    receiverAddr = await receiver.getAddress();
    console.log("✅ EscrowExecReceiver =", receiverAddr);
  } else {
    console.log("\n--- 5) Reuse EscrowExecReceiver ---");
    console.log("✅ EscrowExecReceiver =", receiverAddr);
  }

  // -------------------------------------------------------
  // Sanity reads
  // -------------------------------------------------------
  console.log("\n=== SANITY READS ===");
  console.log("Escrow.weth():", await escrowContract.weth());
  console.log("Escrow.owner():", await escrowContract.owner());
  console.log("Escrow.conditionImpl(1):", await escrowContract.conditionImpl(1));

  if (receiverAddr) {
    const receiver = await ethers.getContractAt("EscrowExecReceiver", receiverAddr, deployer);
    console.log("Receiver.forwarder():", await receiver.forwarder());
    console.log("Receiver.escrow():", await receiver.escrow());
  }

  // -------------------------------------------------------
  // Export
  // -------------------------------------------------------
  console.log("\n=== EXPORT (put into .env) ===");
  console.log("TIME_CONDITION_MAINNET=" + timeCondAddr);
  console.log("ESCROW_MAINNET=" + escrowAddr);
  if (receiverAddr) console.log("RECEIVER_MAINNET=" + receiverAddr);

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

