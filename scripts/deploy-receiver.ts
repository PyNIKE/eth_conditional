import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

async function main() {
  const forwarder = mustEnv("KEYSTONE_FORWARDER_MAINNET");
  const escrow = mustEnv("ESCROW_MAINNET");

  console.log("Deploying EscrowExecReceiver...");
  console.log("  forwarder:", forwarder);
  console.log("  escrow   :", escrow);

  const Receiver = await ethers.getContractFactory("EscrowExecReceiver");
  const receiver = await Receiver.deploy(forwarder, escrow);
  await receiver.waitForDeployment();

  const receiverAddr = await receiver.getAddress();
  console.log("✅ EscrowExecReceiver deployed at:", receiverAddr);

  // Sanity checks (read immutables)
  const fwd = await receiver.forwarder();
  const esc = await receiver.escrow();
  console.log("Sanity:");
  console.log("  receiver.forwarder():", fwd);
  console.log("  receiver.escrow()   :", esc);

  if (fwd.toLowerCase() !== forwarder.toLowerCase()) {
    throw new Error("Forwarder mismatch after deploy");
  }
  if (esc.toLowerCase() !== escrow.toLowerCase()) {
    throw new Error("Escrow mismatch after deploy");
  }

  console.log("\n➡️  Now add this to .env and deployments/mainnet.json:");
  console.log(`RECEIVER_MAINNET=${receiverAddr}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
