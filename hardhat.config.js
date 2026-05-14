import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";
dotenv.config();

function getAccounts() {
  const raw = (process.env.PRIVATE_KEY || "").trim();
  if (!raw) return [];
  const key = raw.startsWith("0x") ? raw.slice(2) : raw;
  return /^[0-9a-fA-F]{64}$/.test(key) ? [`0x${key}`] : [];
}

export default defineConfig({
  plugins: [hardhatEthers, hardhatVerify],
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    bsc: {
      type: "http",
      url: process.env.BSC_RPC_URL || "https://rpc.ankr.com/bsc/567ded437255a1b5ccd46b5eb5155197ac24de6c90ebc56f1403ddcf0eb165e3",
      accounts: getAccounts(),
    },
    bscTestnet: {
      type: "http",
      url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
      accounts: getAccounts(),
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.BSCSCAN_API_KEY,
    },
  },
});