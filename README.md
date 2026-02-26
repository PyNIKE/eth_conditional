Conditional Escrow (WETH) + External API + Chainlink CRE (E2E Demo)

A demo project showcasing a conditional WETH escrow with full workflow orchestration:

Blockchain event → External API → Cryptographic verification → Chainlink secure write → Onchain payout

This project was built for hackathon / technical demo purposes.

1️⃣ About the Project (Short Overview)

This project demonstrates a conditional WETH escrow on Ethereum mainnet:

Payer creates an agreement and deposits WETH into the escrow contract.

Worker / Payee performs an onchain task (writes a value into DemoConfig).

Worker sends a signed completion claim to an external API.

Chainlink CRE workflow catches the onchain EscrowSignal event, checks task status via the API + verifies the worker’s signature, then performs a secure write (writeReport) back onchain.

Finally, executeIfSatisfied(id) is called and the escrow releases WETH to the worker (payout).

🎯 Goal of this demo: show real orchestration of
blockchain event → external API → cryptographic verification → onchain write → payout.

⚙️ Tech Stack

Hardhat + TypeScript

Ethereum Mainnet

WETH (ERC-20) — escrow asset

External Task API

Chainlink CRE CLI

Etherscan — transaction verification

🧩 Architecture
Payer → Escrow Contract → EscrowSignal
           ↓
     Chainlink CRE Workflow
           ↓
External API + Signature Verify
           ↓
        writeReport
           ↓
 executeIfSatisfied → WETH payout
✅ Prerequisites
1. Two Wallets

You need 2 accounts / private keys:

Payer

creates agreement

deposits WETH

executes payout

Worker / Payee

performs onchain task (setConfig)

submits completion claim

👉 You can create two MetaMask accounts and export private keys into .env.

On mainnet, payer must have:

ETH for gas

some WETH for deposit

2. Environment Variables

Create .env (see .env.example):

MAINNET_RPC_URL=
PAYER_PRIVATE_KEY=
WORKER_PRIVATE_KEY=
ESCROW_ADDRESS=
DEMO_CONFIG_ADDRESS=
WETH_ADDRESS=
API_URL=

⚠️ Never commit .env to GitHub.

🚀 E2E Runbook (Jury Quickstart)

After each step, save txHash and ID — these are your proofs.

Step 1 — Create Agreement + Deposit
HOURS=1 npm run demo:create

Save:

newAgreementId = <ID>
CREATE_TX = <CREATE_TX>
DEPOSIT_TX = <DEPOSIT_TX>
EVENT_INDEX = <EVENT_INDEX>
Step 2 — Worker Onchain Task
KEY=<ID> VALUE=777 npm run demo:setconfig

Save:

WORK_TX = <WORK_TX>
Step 3 — Completion Claim via API
ID=<ID> KEY=<ID> VALUE=777 TX=<WORK_TX> npm run demo:complete

Check:

status: completed
Step 4 — Chainlink CRE Workflow
cd eth-condition
cre workflow simulate . --target production-settings --broadcast

Enter when prompted:

transaction hash → <DEPOSIT_TX>
event index → <EVENT_INDEX>

Save:

WRITEREPORT_TX = <WRITEREPORT_TX>
Step 5 — Execute Payout
ID=<ID> npm run demo:execute

Save:

EXECUTE_TX = <EXECUTE_TX>

Verify ERC-20 Transfer in Etherscan.

🏁 Jury Proof Checklist

Minimum 5 transactions:

CREATE_TX

DEPOSIT_TX

WORK_TX

WRITEREPORT_TX

EXECUTE_TX

⚠️ Common Issues
Execute Transaction Stuck

Possible reasons:

pending transaction

nonce conflict

Solution:

check EXECUTE_TX in Etherscan

speed up or cancel earlier pending tx

Hardhat Error -- --key on Windows

Use ENV format:

KEY=... VALUE=... npm run demo:setconfig
📁 Project Structure
contracts/
scripts/
eth-condition/        # Chainlink CRE workflow
api/                  # External API
test/
.env.example
🔐 Security

Never publish private keys

Use testnet for development

🤝 Contact

Telegram: @Top_horse

📜 License

MIT
