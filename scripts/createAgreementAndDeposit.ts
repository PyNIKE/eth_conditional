import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function lower(a: string) {
  return a.toLowerCase();
}

async function main() {
  const ESCROW = req("ESCROW_MAINNET");
  const WETH = req("WETH_MAINNET");
  const PAYEE = req("PAYEE");
  const TIME_CONDITION = req("TIME_CONDITION_MAINNET");
  const amountStr = req("DEMO_AMOUNT_WETH");

  const amount = ethers.parseUnits(amountStr, 18);

  const [payer] = await ethers.getSigners();
  const payerAddr = await payer.getAddress();

  console.log("Payer:", payerAddr);
  console.log("Escrow:", ESCROW);
  console.log("WETH:", WETH);
  console.log("Payee:", PAYEE);
  console.log("Amount (wei):", amount.toString());

  // Escrow ABI (минимум)
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

  // 1) найти conditionType для TimeCondition
  let condType: number | undefined = undefined;
  for (let t = 0; t <= 50; t++) {
    const impl: string = await escrow.conditionImpl(t);
    if (impl && lower(impl) === lower(TIME_CONDITION)) {
      condType = t;
      break;
    }
  }
  if (condType === undefined) {
    throw new Error(
      `TimeCondition not registered in conditionImpl[0..50]. Expected ${TIME_CONDITION}`
    );
  }
  console.log("TimeCondition conditionType =", condType);

  // 2) собрать condition (unlockTime уже в прошлом => satisfied сразу)
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + 6 * 3600; // +6h
  const unlockTime = now - 10;     // уже TRUE

  const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [unlockTime]);

  const condition = {
    conditionType: condType,
    target: ethers.ZeroAddress,
    data,
  };

  console.log("Creating agreement...", { deadline, unlockTime });

  // 3) createAgreement
  const txCreate = await escrow.createAgreement(PAYEE, amount, deadline, condition);
  console.log("txHash_createAgreement =", txCreate.hash);

  const rcCreate = await txCreate.wait();
  if (!rcCreate) throw new Error("No receipt for createAgreement");

  // 4) достать newAgreementId + eventIndex EscrowSignal из receipt (без TS-ада)
  let newAgreementId: bigint | null = null;

  for (let i = 0; i < rcCreate.logs.length; i++) {
    const log = rcCreate.logs[i];
    try {
      const parsed = escrow.interface.parseLog(log);
      if (!parsed) continue;

      if (parsed.name === "AgreementCreated") {
        // args.id в ethers v6 — типизирован слабо, приводим аккуратно
        newAgreementId = BigInt(parsed.args.id.toString());
      }

      if (parsed.name === "EscrowSignal") {
        const id = BigInt(parsed.args.id.toString());
        console.log(
          `EscrowSignal in create receipt: eventIndex=${i}, id=${id.toString()}`
        );
      }
    } catch {
      // ignore unrelated logs
    }
  }

  if (newAgreementId === null) {
    throw new Error("AgreementCreated not found in createAgreement receipt");
  }
  console.log("newAgreementId =", newAgreementId.toString());

  // 5) approve (если надо)
  const allowance: bigint = await weth.allowance(payerAddr, ESCROW);
  if (allowance < amount) {
    const txApprove = await weth.approve(ESCROW, amount);
    console.log("txHash_approve =", txApprove.hash);
    await txApprove.wait();
  } else {
    console.log("approve skipped: allowance ok");
  }

  // 6) deposit (лучший tx для CRE, т.к. state=Funded)
  const txDep = await escrow.deposit(newAgreementId);
  console.log("txHash_deposit =", txDep.hash);

  const rcDep = await txDep.wait();
  if (!rcDep) throw new Error("No receipt for deposit");

  for (let i = 0; i < rcDep.logs.length; i++) {
    const log = rcDep.logs[i];
    try {
      const parsed = escrow.interface.parseLog(log);
      if (!parsed) continue;

      if (parsed.name === "EscrowSignal") {
        const id = BigInt(parsed.args.id.toString());
        console.log(
          `EscrowSignal in deposit receipt: eventIndex=${i}, id=${id.toString()}`
        );
      }

      if (parsed.name === "Deposited") {
        const id = BigInt(parsed.args.id.toString());
        console.log(
          `Deposited: id=${id.toString()} amount=${parsed.args.wethAmount.toString()} fee=${parsed.args.fee.toString()}`
        );
      }
    } catch {
      // ignore unrelated logs
    }
  }

  // 7) sanity check deadline
  const a = await escrow.agreements(newAgreementId);
  const secondsToDeadline = Number(a.deadline) - Math.floor(Date.now() / 1000);
  console.log("seconds_to_deadline =", secondsToDeadline);
  if (secondsToDeadline <= 0) throw new Error("Deadline already passed!");

  console.log("\nNEXT STEPS:");
  console.log(
    `1) KEY_U256=${newAgreementId.toString()} VALUE_U256=777 npx hardhat run scripts/setConfig.ts --network mainnet`
  );
  console.log(
    `2) TX_HASH_WORK=<txHash_from_setConfig> AGREEMENT_ID=${newAgreementId.toString()} (run completeTask with envs)`
  );
  console.log(
    `3) CRE broadcast: use txHash_deposit=${txDep.hash} and eventIndex printed above (EscrowSignal in deposit receipt)`
  );
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});