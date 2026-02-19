import "dotenv/config"
import hre from "hardhat"
import { AbiCoder } from "ethers"

async function main() {
  const { ethers } = hre

  const escrowAddr = process.env.ESCROW_MAINNET!
  const timeConditionTarget = process.env.TIME_CONDITION_MAINNET! // target = адрес контракта условия
  const [signer] = await ethers.getSigners()

  console.log("Signer:", await signer.getAddress())
  console.log("Escrow:", escrowAddr)

  const escrow = await ethers.getContractAt("EscrowManagerMainnetDemo", escrowAddr, signer)

  const payee = "0x2B5E0ddEB8F14e0bfAA0b7ee398c537Bf6541330"
  const wethAmount = ethers.parseEther("0.0001")

  // deadline должен быть в будущем
  const now = Math.floor(Date.now() / 1000)
  const deadline = now + 3600 // +1 час

  // условие time: обычно кодируют timestamp, после которого satisfied=true
  const unlockTime = now + 60 // условие будет true через 60 сек

  const coder = AbiCoder.defaultAbiCoder()
  const conditionData = coder.encode(["uint256"], [unlockTime])

  const condition = {
    conditionType: 1,
    target: timeConditionTarget,
    data: conditionData,
  }

  const tx = await escrow.createAgreement(payee, wethAmount, deadline, condition)
  console.log("✅ TX HASH:", tx.hash)

  const receipt = await tx.wait()
  console.log("✅ Confirmed in block:", receipt?.blockNumber)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


