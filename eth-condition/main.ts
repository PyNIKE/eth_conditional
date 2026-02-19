import {
  EVMClient,
  HTTPClient,
  Runner,
  handler,
  getNetwork,
  hexToBase64,
  bytesToHex,
  type Runtime,
  type NodeRuntime,
  type EVMLog,
} from "@chainlink/cre-sdk"

import {
  keccak256,
  toBytes,
  encodeAbiParameters,
  parseAbiParameters,
  verifyMessage,
  type Hex,
} from "viem"

type Config = {
  chainSelectorName: string
  isTestnet: boolean

  escrowAddress: `0x${string}`
  receiverAddress: `0x${string}`

  chainId: number
  apiBaseUrl: string

  gasLimit: string
  confidence?: "CONFIDENCE_LEVEL_LATEST" | "CONFIDENCE_LEVEL_SAFE" | "CONFIDENCE_LEVEL_FINALIZED"
}

type ApiTask = {
  chainId: number
  agreementId: number
  status: "pending" | "completed" | "disputed"
  worker: `0x${string}`
  txHash: `0x${string}`
  completedAt: number
  signature: `0x${string}`
}

function buildCompletionMessage(task: Pick<ApiTask, "chainId" | "agreementId" | "txHash" | "completedAt">) {
  return `JiffyEscrowComplete|chainId=${task.chainId}|agreementId=${task.agreementId}|txHash=${task.txHash}|completedAt=${task.completedAt}`
}

/**
 * EscrowSignal(uint256 indexed id)
 * -> topics[0] = signature
 * -> topics[1] = id (32 bytes)
 * -> data = 0x (пусто)
 */
function parseAgreementId(runtime: Runtime<Config>, log: EVMLog): bigint | null {
  try {
    if (!log.topics || log.topics.length < 2) return null
    const idHex = bytesToHex(log.topics[1]) as Hex
    return BigInt(idHex)
  } catch (e: any) {
    runtime.log(`parseAgreementId failed: ${e?.message ?? String(e)}`)
    return null
  }
}

/**
 * "identical aggregation" для строк:
 * берём наиболее частую строку (mode).
 */
function makeIdenticalStringAggregation(): any {
  return {
    aggregate: (values: string[]) => {
      if (!values || values.length === 0) return ""
      const counts = new Map<string, number>()
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)

      let bestVal = values[0]
      let bestCnt = 0
      for (const [v, c] of counts.entries()) {
        if (c > bestCnt) {
          bestCnt = c
          bestVal = v
        }
      }
      return bestVal
    },
  }
}

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: config.isTestnet,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)

  // topic0 = keccak256("EscrowSignal(uint256)")
  const escrowSignalTopic0 = keccak256(toBytes("EscrowSignal(uint256)"))

  const onLog = (runtime: Runtime<Config>, log: EVMLog): string => {
    const agreementId = parseAgreementId(runtime, log)
    if (agreementId === null) return "skip: not escrow signal"

    runtime.log(`EscrowSignal caught: id=${agreementId.toString()} tx=${bytesToHex(log.txHash)}`)

    // --- HTTP GET в NodeRuntime через runInNodeMode ---
    const fetchTaskText = (nodeRuntime: NodeRuntime<Config>): string => {
      const httpClient = new HTTPClient()

      const url =
        `${nodeRuntime.config.apiBaseUrl.replace(/\/$/, "")}` +
        `/tasks/${nodeRuntime.config.chainId}/${agreementId.toString()}`

      const resp = httpClient.sendRequest(nodeRuntime, { method: "GET", url }).result()
      return new TextDecoder().decode(resp.body)
    }

    const taskText = runtime
      .runInNodeMode(fetchTaskText, makeIdenticalStringAggregation())()
      .result()

    let task: ApiTask
    try {
      task = JSON.parse(taskText) as ApiTask
    } catch {
      runtime.log(`API returned non-JSON: ${taskText.slice(0, 250)}`)
      return "skip: bad api json"
    }

    if (!task || task.status !== "completed") {
      runtime.log(`Task status=${task?.status ?? "unknown"} => skip`)
      return "skip: not completed"
    }

    // Verify signature (EIP-191 signMessage)
    const msg = buildCompletionMessage({
      chainId: task.chainId,
      agreementId: task.agreementId,
      txHash: task.txHash,
      completedAt: task.completedAt,
    })

    const sigOk = verifyMessage({
      address: task.worker,
      message: msg,
      signature: task.signature,
    })

    if (!sigOk) {
      runtime.log(`Bad signature. worker=${task.worker} agreementId=${task.agreementId}`)
      return "skip: bad signature"
    }

    // Report = abi.encode(uint256 agreementId)
    const payload = encodeAbiParameters(parseAbiParameters("uint256 agreementId"), [agreementId])

    const report = runtime
      .report({
        encodedPayload: hexToBase64(payload),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      })
      .result()

    // Secure write to Receiver
    const wr = evmClient
      .writeReport(runtime, {
        receiver: runtime.config.receiverAddress,
        report,
        gasConfig: { gasLimit: runtime.config.gasLimit },
      })
      .result()

    runtime.log(`writeReport OK. txHash=${bytesToHex(wr.txHash || new Uint8Array(32))}`)
    return `ok: wrote report for id=${agreementId.toString()}`
  }

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.escrowAddress)],
        topics: [{ values: [hexToBase64(escrowSignalTopic0)] }],
        confidence: config.confidence ?? "CONFIDENCE_LEVEL_SAFE",
      }),
      onLog
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}




