import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

const ESCROW = process.env.ESCROW_MAINNET!;
const ID = Number(process.env.AGREEMENT_ID || "0");
if (!Number.isFinite(ID) || ID <= 0) throw new Error("Set AGREEMENT_ID");



async function main() {
  const escrow = new ethers.Contract(
    ESCROW,
    [
      "function agreements(uint256) view returns (address payer,address payee,address token,uint256 amount,uint256 createdAt,uint256 deadline,(uint8 conditionType,address target,bytes data) condition,uint8 state)"
    ],
    ethers.provider
  );

  const a = await escrow.agreements(ID);

  console.log("payer:", a.payer);
  console.log("payee:", a.payee);
  console.log("token:", a.token);
  console.log("amount:", a.amount.toString());
  console.log("createdAt:", a.createdAt.toString());
  console.log("deadline:", a.deadline.toString());
  console.log("state:", a.state.toString());

  const now = Math.floor(Date.now()/1000);
  console.log("now:", now);
  console.log("seconds_to_deadline:", Number(a.deadline) - now);
}

main().catch((e) => { console.error(e); process.exit(1); });