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

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function lower(a: string) {
  return a.toLowerCase();
}

function usage() {
  console.log(`Usage:
  npx hardhat run scripts/createAgreementAndDeposit.ts --network mainnet -- [--hours 6] [--amount 0.00126] [--unlockOffset -10]

Args:
  --hours         deadline offset in hours (default: 6)
  --amount        WETH amount (default: DEMO_AMOUNT_WETH from .env)
  --unlockOffset  seconds offset from now for unlockTime (default: -10, i.e. already satisfied)

Env (required):
  ESCROW_MAINNET
  WETH_MAINNET
  PAYEE
  TIME_CONDITION_MAINNET
  DEMO_AMOUNT_WETH
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  const ESCROW = req("ESCROW_MAINNET");
  const WETH = req("WETH_MAINNET");
  const PAYEE = req("PAYEE");
  const TIME_CONDITION = req("TIME_CONDITION_MAINNET");

  const hours = Number(getArg("hours") || "6");
  if (!Number.isFinite(hours) || hours <= 0) throw new Error("Bad --hours");

  const unlockOffset = Number(getArg("unlockOffset") || "-10");
  if (!Number.isFinite(unlockOffset)) throw new Error("Bad --unlockOffset");

  const amountStr = getArg("amount") || req("DEMO_AMOUNT_WETH");
  const amount = ethers.parseUnits(amountStr, 18);

  const [payer] = await ethers.getSigners();
  const payerAddr = await payer.getAddress();

  console.log("Payer:", payerAddr);
  console.log("Escrow:", ESCROW);
  console.log("WETH:", WETH);
  console.log("Payee:", PAYEE);
  console.log("Amount (wei):", amount.toString());

  const escrow = new ethers.Contract(
    ESCROW,
    [
      "function conditionImpl(uint8) view returns (address)",
      "function createAgreement(address payee,uint256 wethAmount,uint256 deadline,(uint8 conditionType,address target,bytes data) condition) returns (uint256 id)",
      "function deposit(uint256 id) external",
      "function agreements(uint256) view returns (address payer,address payee,address token,uint256 amount,uint256 createdAt,uint256 deadline,(uint8 conditionType,address target,bytes data) condition,uint8 state)",
      "event AgreementCreated(uint256 indexed id,address indexed payer,address indexed payee,uint256 wethAmount,uint256 deadline,uint8 conditionType,address conditionTarget)",
      "event EscrowSignal(uint256 indexed id)",
      "event Deposited(uint256 indexed id,address indexed payer,uint256 wethAmount,uint256 fee)",
    ],
    payer
  );

  const weth = new ethers.Contract(
    WETH,
    [
      "function approve(address spender,uint256 value) external returns (bool)",
      "function allowance(address owner,address spender) external view returns (uint256)",
    ],
    payer
  );

  let condType: number | undefined = undefined;
  for (let t = 0; t <= 50; t++) {
    const impl: string = await escrow.conditionImpl(t);
    if (impl && lower(impl) === lower(TIME_CONDITION)) {
      condType = t;
      break;
    }
  }
  if (condType === undefined) {
    throw new Error(`TimeCondition not registered in conditionImpl[0..50]. Expected ${TIME_CONDITION}`);
  }
  console.log("TimeCondition conditionType =", condType);

  const now = Math.floor(Date.now() / 1000);
  const deadline = now + Math.floor(hours * 3600);
  const unlockTime = now + Math.floor(unlockOffset);

  const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [unlockTime]);
  const condition = { conditionType: condType, target: ethers.ZeroAddress, data };

  console.log("Creating agreement...", { deadline, unlockTime });

  const txCreate = await escrow.createAgreement(PAYEE, amount, deadline, condition);
  console.log("txHash_createAgreement =", txCreate.hash);

  const rcCreate = await txCreate.wait();
  if (!rcCreate) throw new Error("No receipt for createAgreement");

  let newAgreementId: bigint | null = null;
  for (let i = 0; i < rcCreate.logs.length; i++) {
    try {
      const parsed = escrow.interface.parseLog(rcCreate.logs[i]);
      if (!parsed) continue;

      if (parsed.name === "AgreementCreated") newAgreementId = BigInt(parsed.args.id.toString());
      if (parsed.name === "EscrowSignal") {
        const id = BigInt(parsed.args.id.toString());
        console.log(`EscrowSignal in create receipt: eventIndex=${i}, id=${id.toString()}`);
      }
    } catch {}
  }

  if (newAgreementId === null) throw new Error("AgreementCreated not found in createAgreement receipt");
  console.log("newAgreementId =", newAgreementId.toString());

  const allowance: bigint = await weth.allowance(payerAddr, ESCROW);
  if (allowance < amount) {
    const txApprove = await weth.approve(ESCROW, amount);
    console.log("txHash_approve =", txApprove.hash);
    await txApprove.wait();
  } else {
    console.log("approve skipped: allowance ok");
  }

  const txDep = await escrow.deposit(newAgreementId);
  console.log("txHash_deposit =", txDep.hash);

  const rcDep = await txDep.wait();
  if (!rcDep) throw new Error("No receipt for deposit");

  for (let i = 0; i < rcDep.logs.length; i++) {
    try {
      const parsed = escrow.interface.parseLog(rcDep.logs[i]);
      if (!parsed) continue;

      if (parsed.name === "EscrowSignal") {
        const id = BigInt(parsed.args.id.toString());
        console.log(`EscrowSignal in deposit receipt: eventIndex=${i}, id=${id.toString()}`);
      }
      if (parsed.name === "Deposited") {
        const id = BigInt(parsed.args.id.toString());
        console.log(`Deposited: id=${id.toString()} amount=${parsed.args.wethAmount.toString()} fee=${parsed.args.fee.toString()}`);
      }
    } catch {}
  }

  const a = await escrow.agreements(newAgreementId);
  const secondsToDeadline = Number(a.deadline) - Math.floor(Date.now() / 1000);
  console.log("seconds_to_deadline =", secondsToDeadline);
  if (secondsToDeadline <= 0) throw new Error("Deadline already passed!");

  console.log("\nNEXT STEPS (jury copy-paste):");
  console.log(`1) setConfig:
  npx hardhat run scripts/setConfig.ts --network mainnet -- --key ${newAgreementId.toString()} --value 777`);

  console.log(`2) completeTask (use txHash_work from step 1):
  npx hardhat run scripts/completeTask.ts --network mainnet -- --id ${newAgreementId.toString()} --key ${newAgreementId.toString()} --value 777 --tx <txHash_work>`);

  console.log(`3) CRE:
  cd eth-condition
  cre workflow simulate . --target production-settings --broadcast
  (txHash=${txDep.hash}, eventIndex=2 as printed above)
  `);

  console.log(`4) execute:
  cd ..
  npx hardhat run scripts/executeIfSatisfied.ts --network mainnet -- --id ${newAgreementId.toString()}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});