import { verifySignature, recoverWorkerAddress } from "../workflows/escrow-cre/src/verifySignature";

const sample = {
  chainId: 1,
  agreementId: 123,
  worker: "0x1111111111111111111111111111111111111111",
  txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  completedAt: 1730000000,
  signature: "0xbbbbbbbbbb" // подставь реальную подпись из completeTask.ts вывода
};

console.log("recovered:", recoverWorkerAddress(sample));
console.log("valid:", verifySignature(sample));
