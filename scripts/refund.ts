import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

const ESCROW = process.env.ESCROW_MAINNET || "0xeDA0EDd5F5F275c9f0288E67BA7e710f886BeD81";
const OWNER_PK = process.env.CRE_ETH_PRIVATE_KEY || "";
const ID = 13;

async function main() {
  if (!OWNER_PK) throw new Error("Set CRE_ETH_PRIVATE_KEY in .env");

  const signer = new ethers.Wallet(OWNER_PK, ethers.provider);
  console.log("Signer:", await signer.getAddress());

  const escrow = new ethers.Contract(
    ESCROW,
    [
      "function refund(uint256 id) external",
      "event Refunded(uint256 indexed id)",
    ],
    signer
  );

  const tx = await escrow.refund(ID);
  console.log("refund txHash:", tx.hash);

  const rcpt = await tx.wait();
  console.log("mined block:", rcpt.blockNumber, "status:", rcpt.status);

  // Печатаем Refunded если есть
  for (const log of rcpt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed?.name === "Refunded") console.log("Event Refunded:", parsed.args);
    } catch {}
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});