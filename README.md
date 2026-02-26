# Conditional Escrow (WETH) + External API + Chainlink CRE (E2E Demo)


A demo project showcasing a conditional WETH escrow with full workflow orchestration:
Blockchain Event → External API → Cryptographic Verification → Chainlink Secure Write → Onchain Payout
Built for hackathon / technical demo purposes.



## 📌 About the Project
This project demonstrates a conditional WETH escrow on Ethereum mainnet.
Workflow

Payer
Creates an agreement
Deposits WETH into escrow

Worker / Payee
Performs an onchain task (DemoConfig.setConfig)
Sends signed completion claim to external API

Chainlink CRE
Listens for EscrowSignal
Verifies API status + worker signature
Performs secure write (writeReport)

Escrow Contract
executeIfSatisfied(id)
Releases WETH payout

🎯 Goal: demonstrate real orchestration of
Blockchain → API → Crypto Verification → Onchain Write → Payout



## ⚙️Tech Stak

Hardhat + TypeScript
Ethereum Mainnet
WETH (ERC-20) escrow asset
External Task API
Chainlink CRE CLI
Etherscan for verification


## 🌐 External API 
This demo uses a public task-verification API.
API Base URL:
API_BASE_URL=https://api.147.182.247.224.nip.io
Example health check:
curl https://api.147.182.247.224.nip.io/health
Example task query:
curl https://api.147.182.247.224.nip.io/tasks/1/<ID>




## 🧩 Architecture

Payer
   ↓
Escrow Contract ── EscrowSignal Event
   ↓
Chainlink CRE Workflow
   ↓
External API + Signature Verification
   ↓
writeReport (secure onchain write)
   ↓
executeIfSatisfied → WETH payout



<img width="377" height="658" alt="image" src="https://github.com/user-attachments/assets/9c9d8838-5753-4b81-a99b-392bf08c5d03" />






## ✅ Prerequisites
1. Two Wallets
You need 2 accounts / private keys.

Payer
Creates agreement
Deposits WETH
Executes payout

Worker / Payee
Runs onchain task (setConfig)
Submits completion claim

### Create two MetaMask accounts and export keys into .env.

Payer must have:
ETH for gas
Some WETH


2. Environment Variables
Create .env (see .env.example):
MAINNET_RPC_URL=
PAYER_PRIVATE_KEY=
WORKER_PRIVATE_KEY=
ESCROW_ADDRESS=
DEMO_CONFIG_ADDRESS=
WETH_ADDRESS=
API_URL=
⚠️ Never commit .env to GitHub



## 🚀 E2E Runbook (Jury Quickstart)

Save all tx hashes and IDs as proof.

Step 1 — Create Agreement + Deposit
HOURS=1 npm run demo:create
Save:
ID
CREATE_TX
DEPOSIT_TX
EVENT_INDEX



Step 2 — Worker Onchain Task
KEY=<ID> VALUE=777 npm run demo:setconfig
Save:
WORK_TX


Step 3 — Completion Claim via API
ID=<ID> KEY=<ID> VALUE=777 TX=<WORK_TX> npm run demo:complete
Check:
status: completed


Step 4 — Chainlink CRE Workflow
cd eth-condition
cre workflow simulate . --target production-settings --broadcast
Enter:
transaction hash → DEPOSIT_TX
event index → EVENT_INDEX
Save:
WRITEREPORT_TX


Step 5 — Execute Payout
ID=<ID> npm run demo:execute
Save:
EXECUTE_TX
Verify ERC-20 transfer in Etherscan.



## 🏁 Jury Proof Checklist
✅ CREATE_TX
✅ DEPOSIT_TX
✅ WORK_TX
✅ WRITEREPORT_TX
✅ EXECUTE_TX


## ⚠️ Common Issues
Execute Transaction Stuck
Possible reasons:
Pending transaction
Nonce conflict
Solution:
Check EXECUTE_TX in Etherscan
Speed up or cancel earlier tx

Hardhat Error -- --key on Windows
Use ENV format:
KEY=... VALUE=... npm run demo:setconfig


## 📁 Project Structure
contracts/
scripts/
eth-condition/        # Chainlink CRE workflow
api/                  # External API
test/
.env.example


## 🤝 Contact
Telegram: @Top_horse


## 📜 License
MIT
