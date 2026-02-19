import { ethers } from "ethers";

/**
 * Каноническое сообщение (должно 1-в-1 совпадать с тем, что подписывает worker в completeTask.ts)
 */
export function buildCompletionMessage(params: {
  chainId: number;
  agreementId: number;
  txHash: string;
  completedAt: number;
}) {
  const { chainId, agreementId, txHash, completedAt } = params;
  return `JiffyEscrowComplete|chainId=${chainId}|agreementId=${agreementId}|txHash=${txHash}|completedAt=${completedAt}`;
}

/**
 * Восстановление адреса из подписи EIP-191 (wallet.signMessage)
 */
export function recoverWorkerAddress(params: {
  chainId: number;
  agreementId: number;
  txHash: string;
  completedAt: number;
  signature: string;
}) {
  const message = buildCompletionMessage(params);
  // ethers.verifyMessage делает ровно то, что нужно для signMessage():
  // recover(signMessage(message))
  const recovered = ethers.verifyMessage(message, params.signature);
  return recovered;
}

/**
 * Полная проверка: recovered == worker
 */
export function verifySignature(params: {
  chainId: number;
  agreementId: number;
  worker: string;
  txHash: string;
  completedAt: number;
  signature: string;
}) {
  const recovered = recoverWorkerAddress(params);
  return recovered.toLowerCase() === params.worker.toLowerCase();
}
