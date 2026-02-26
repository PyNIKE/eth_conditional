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
  npx hardhat run scripts/checkAgreement.ts --network mainnet -- --id <agreementId>

Args:
  --id   Agreement ID (required)

Env:
  ESCROW_MAINNET (required)
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  const ESCROW = process.env.ESCROW_MAINNET;
  if (!ESCROW) throw new Error("Missing ESCROW_MAINNET in .env");

  const idStr = getArg("id");
  if (!idStr) throw new Error("Missing --id");
  const ID = Number(idStr);
  if (!Number.isFinite(ID) || ID <= 0) throw new Error("Bad --id");

  const escrow = new ethers.Contract(
    ESCROW,
    [
      "function agreements(uint256) view returns (address payer,address payee,address token,uint256 amount,uint256 createdAt,uint256 deadline,(uint8 conditionType,address target,bytes data) condition,uint8 state)",
    ],
    ethers.provider
  );

  const a = await escrow.agreements(ID);

  console.log("id:", ID);
  console.log("payer:", a.payer);
  console.log("payee:", a.payee);
  console.log("token:", a.token);
  console.log("amount:", a.amount.toString());
  console.log("createdAt:", a.createdAt.toString());
  console.log("deadline:", a.deadline.toString());
  console.log("state:", a.state.toString());

  const now = Math.floor(Date.now() / 1000);
  console.log("now:", now);
  console.log("seconds_to_deadline:", Number(a.deadline) - now);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});