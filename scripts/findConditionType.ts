import "dotenv/config"
import hre from "hardhat"
import { Contract, Wallet, JsonRpcProvider } from "ethers"

async function main() {
  const rpcUrl = process.env.ETH_RPC_URL || process.env.ETH_RPC
  const pk = process.env.PRIVATE_KEY || process.env.CRE_ETH_PRIVATE_KEY
  const escrowAddr = process.env.ESCROW_MAINNET

  if (!rpcUrl) throw new Error("Missing ETH_RPC_URL (or ETH_RPC)")
  if (!pk) throw new Error("Missing PRIVATE_KEY (or CRE_ETH_PRIVATE_KEY)")
  if (!escrowAddr) throw new Error("Missing ESCROW_MAINNET")

  const provider = new JsonRpcProvider(rpcUrl)
  const signer = new Wallet(pk, provider)

  const artifact = await hre.artifacts.readArtifact("EscrowManagerMainnetDemo")
  const escrow = new Contract(escrowAddr, artifact.abi, signer)

  console.log("Escrow:", escrowAddr)

  // обычно типов немного — проверим 0..20
  for (let t = 0; t <= 20; t++) {
    const impl: string = await escrow.conditionImpl(t)
    if (impl !== "0x0000000000000000000000000000000000000000") {
      console.log(`✅ conditionType=${t} -> impl=${impl}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
