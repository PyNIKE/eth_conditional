import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
import "@nomicfoundation/hardhat-ethers";



const PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  process.env.CRE_ETH_PRIVATE_KEY || // fallback, если используешь один и тот же ключ
  "";

const ETH_RPC_URL =
  process.env.ETH_RPC_URL ||
  process.env.ETH_RPC ||
  "";

if (!ETH_RPC_URL) {
  throw new Error("Missing ETH_RPC_URL (or ETH_RPC) in .env");
}
if (!PRIVATE_KEY) {
  throw new Error("Missing PRIVATE_KEY (or CRE_ETH_PRIVATE_KEY) in .env");
}

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    mainnet: {
      url: ETH_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 1,
    },
  },
};

export default config;

