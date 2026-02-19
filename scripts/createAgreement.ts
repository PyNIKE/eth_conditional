import { ethers } from "hardhat";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

async function main() {
  const escrowAddr = mustEnv("ESCROW_MAINNET");

  // CLI:
  // yarn hardhat run scripts/createAgreement.ts --network mainnet -- <payee> <amountWeth> [unlockSeconds] [deadlineSeconds]
  const payee = process.argv[2];
  const amountWethStr = process.argv[3];
  const unlockSeconds = Number(process.argv[4] ?? "120");     // default 2 min
  const deadlineSeconds = Number(process.argv[5] ?? "900");   // default 15 min

  if (!payee) throw new Error("Usage: createAgreement.ts <payee> <amountWeth> [unlockSeconds] [deadlineSeconds]");
  if (!amountWethStr) throw new Error("Usage: createAgreement.ts <payee> <amountWeth> [unlockSeconds] [deadlineSeconds]");

  if (!ethers.isAddress(payee)) throw new Error("Bad payee address");

  const amount = ethers.parseUnits(amountWethStr, 18);

  const escrow = await ethers.getContractAt("EscrowManagerMainnetDemo", escrowAddr);
  const latest = await ethers.provider.getBlock("latest");
  if (!latest) throw new Error("Cannot read latest block");
  const now = BigInt(latest.timestamp);

  const unlockTime = now + BigInt(unlockSeconds);
  const deadline = now + BigInt(deadlineSeconds);

  // TimeCondition expects abi.encode(uint256 unlockTime)
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const conditionData = abi.encode(["uint256"], [unlockTime]);

  // conditionType=1 (TimeCondition), target можно любой; для ясности ставим escrow address
  const condition = {
    conditionType: 1,
    target: escrowAddr,
    data: conditionData,
  };

  console.log("Creating agreement...");
  console.log("  escrow  :", escrowAddr);
  console.log("  payee   :", payee);
  console.log("  amount  :", amount.toString(), "(wei)");
  console.log("  unlock  :", unlockTime.toString());
  console.log("  deadline:", deadline.toString());

  const tx = await escrow.createAgreement(payee, amount, deadline, condition);
  console.log("tx:", tx.hash);

  const rc = await tx.wait();
  if (!rc) throw new Error("No receipt");

  // Parse AgreementCreated(id, payer, payee,...)
  let id: bigint | null = null;
  for (const log of rc.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed?.name === "AgreementCreated") {
        id = parsed.args.id as bigint;
        break;
      }
    } catch {}
  }

  if (id === null) throw new Error("AgreementCreated not found in logs");

  console.log("✅ Agreement created. id =", id.toString());
  console.log("Next: deposit with:");
  console.log(`yarn hardhat run scripts/deposit.ts --network mainnet -- ${id.toString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
