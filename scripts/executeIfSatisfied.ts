import { ethers } from "hardhat";
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
  ID=17 npx hardhat run scripts/executeIfSatisfied.ts --network mainnet

  # Option B (works if args reach node process)
  npx hardhat run scripts/executeIfSatisfied.ts --network mainnet -- --id <agreementId>

Args:
  --id   Agreement ID

Env:
  ID or AGREEMENT_ID
  ESCROW_MAINNET (optional fallback)
  CRE_ETH_PRIVATE_KEY (required)
  OWNER (optional)
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  const ESCROW =
    process.env.ESCROW_MAINNET || "0xeDA0EDd5F5F275c9f0288E67BA7e710f886BeD81";
  const OWNER_PK = process.env.CRE_ETH_PRIVATE_KEY || "";
  const OWNER_ADDR = (process.env.OWNER || "").toLowerCase();

  if (!OWNER_PK) throw new Error("Set CRE_ETH_PRIVATE_KEY in .env");

  // ✅ CLI OR ENV (Hardhat-friendly)
  const idStr = getArg("id") || process.env.ID || process.env.AGREEMENT_ID;
  if (!idStr) throw new Error("Missing --id (or set env ID/AGREEMENT_ID)");

  const AGREEMENT_ID = Number(idStr);
  if (!Number.isFinite(AGREEMENT_ID) || AGREEMENT_ID <= 0) throw new Error("Bad agreement id");

  console.log("Signer env loaded:", {
    has_ESCROW_MAINNET: !!process.env.ESCROW_MAINNET,
    has_CRE_ETH_PRIVATE_KEY: !!process.env.CRE_ETH_PRIVATE_KEY,
    has_OWNER: !!process.env.OWNER,
    has_ETH_RPC: !!process.env.ETH_RPC,
  });

  const signer = new ethers.Wallet(OWNER_PK, ethers.provider);
  const signerAddr = (await signer.getAddress()).toLowerCase();
  console.log("Signer:", signerAddr);

  if (OWNER_ADDR && signerAddr !== OWNER_ADDR) {
    console.warn(`⚠️ Signer != OWNER from .env. signer=${signerAddr}, OWNER=${OWNER_ADDR}`);
  }

  const escrow = new ethers.Contract(
    ESCROW,
    [
      "function executeIfSatisfied(uint256 id) external returns (bytes32 requestId)",
      "event Executing(uint256 indexed id)",
      "event Completed(uint256 indexed id)",
      "event ExecutionSkipped(uint256 indexed id, string reason)",
    ],
    signer
  );

  console.log(`Calling executeIfSatisfied(${AGREEMENT_ID}) on ${ESCROW} ...`);
  const tx = await escrow.executeIfSatisfied(AGREEMENT_ID);
  console.log("txHash:", tx.hash);

  const rcpt = await tx.wait();
  console.log("mined block:", rcpt.blockNumber);
  console.log("status:", rcpt.status);

  let sawExecuting = false;
  let sawCompleted = false;
  let sawSkipped = false;

  for (const log of rcpt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed?.name === "Executing") {
        sawExecuting = true;
        console.log("Event Executing:", parsed.args);
      } else if (parsed?.name === "Completed") {
        sawCompleted = true;
        console.log("Event Completed:", parsed.args);
      } else if (parsed?.name === "ExecutionSkipped") {
        sawSkipped = true;
        console.log("Event ExecutionSkipped:", parsed.args);
      }
    } catch {}
  }

  console.log("\nSummary:");
  console.log("Executing:", sawExecuting);
  console.log("Completed:", sawCompleted);
  console.log("Skipped:", sawSkipped);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});