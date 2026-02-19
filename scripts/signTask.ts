import "dotenv/config";
import { Wallet } from "ethers";

async function main() {
  const pk = process.env.CRE_ETH_PRIVATE_KEY!;
  if (!pk) throw new Error("Missing CRE_ETH_PRIVATE_KEY in .env");

  const chainId = 1;
  const agreementId = 1;

  // твой tx hash с EscrowSignal
  const txHash =
    "0x8fef0d7c9ca0bca6d2b6b26ade3cba33fd6b66705bcc409f4ddd804268f237cf";

  const completedAt = Math.floor(Date.now() / 1000);

  const msg =
    `JiffyEscrowComplete|chainId=${chainId}` +
    `|agreementId=${agreementId}` +
    `|txHash=${txHash}` +
    `|completedAt=${completedAt}`;

  const wallet = new Wallet(pk);
  const signature = await wallet.signMessage(msg);

  console.log("worker:", await wallet.getAddress());
  console.log("completedAt:", completedAt);
  console.log("message:", msg);
  console.log("signature:", signature);
}

main().catch(console.error);
