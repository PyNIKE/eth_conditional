import express from "express";
import cors from "cors";
import { Pool } from "pg";

// ✅ onchain verify
import { createPublicClient, http, parseAbi, verifyMessage } from "viem";
import { mainnet } from "viem/chains";

type TaskStatus = "pending" | "completed" | "disputed";

type TaskRecord = {
  chainId: number;
  agreementId: number;
  status: TaskStatus;

  worker?: string;       // address (lowercased)
  txHash?: string;       // 0x...32 bytes
  completedAt?: number;  // unix seconds
  signature?: string;    // 0x...

  // ✅ SET_CONFIG task params
  target?: string;       // DemoConfig address
  key?: string;          // stored as string to avoid JS bigint issues
  value?: string;        // stored as string

  evidence?: string;     // optional (url/text)
  updatedAt: number;     // unix ms
};

function nowMs() {
  return Date.now();
}

function isHex(s: string) {
  return typeof s === "string" && /^0x[0-9a-fA-F]*$/.test(s);
}

function isAddress(addr: string) {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function isTxHash(h: string) {
  return typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h);
}

// BIGINT-safe parse from body
function toBigIntString(x: any): string | null {
  try {
    if (typeof x === "bigint") return x.toString();
    if (typeof x === "number") {
      if (!Number.isFinite(x) || x < 0) return null;
      return Math.floor(x).toString();
    }
    if (typeof x === "string") {
      // allow decimal only (простота + без overflow)
      if (!/^\d+$/.test(x)) return null;
      return x;
    }
    return null;
  } catch {
    return null;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const API_KEY = process.env.API_KEY || ""; // if empty -> auth disabled

// ✅ RPC for onchain reads
const ETH_RPC_URL = process.env.ETH_RPC_URL || process.env.ETH_RPC || "";
if (!ETH_RPC_URL) {
  console.error("❌ ETH_RPC_URL (or ETH_RPC) is not set (needed for onchain verify)");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

// ✅ viem Public Client (read-only)
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(ETH_RPC_URL),
});

// ✅ DemoConfig ABI (минимум что нужно)
const demoConfigAbi = parseAbi([
  "function getConfig(uint256 key) view returns (uint256)",
]);

// ✅ message MUST match worker + CRE
function buildCompletionMessage(params: {
  chainId: number;
  agreementId: number;
  target: string;
  key: string;
  value: string;
  txHash: string;
  completedAt: number;
}) {
  const { chainId, agreementId, target, key, value, txHash, completedAt } = params;

  return [
    "JiffyEscrowComplete",
    `chainId=${chainId}`,
    `agreementId=${agreementId}`,
    `target=${target.toLowerCase()}`,
    `key=${key}`,
    `value=${value}`,
    `txHash=${txHash.toLowerCase()}`,
    `completedAt=${completedAt}`,
  ].join("|");
}

async function ensureSchema() {
  // базовая таблица
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      chain_id INT NOT NULL,
      agreement_id BIGINT NOT NULL,
      status TEXT NOT NULL,
      worker TEXT,
      tx_hash TEXT,
      completed_at BIGINT,
      signature TEXT,

      -- ✅ SET_CONFIG task params
      target TEXT,
      cfg_key TEXT,
      cfg_value TEXT,

      evidence TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (chain_id, agreement_id)
    );
  `);

  // ✅ миграция для уже существующей таблицы (если она была без колонок)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS target TEXT;`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cfg_key TEXT;`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cfg_value TEXT;`);
}

function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!API_KEY) return next();
  const k = req.header("x-api-key");
  if (k !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  return next();
}

function rowToRecord(row: any): TaskRecord {
  return {
    chainId: Number(row.chain_id),
    agreementId: Number(row.agreement_id),
    status: row.status as TaskStatus,
    worker: row.worker ?? undefined,
    txHash: row.tx_hash ?? undefined,
    completedAt: row.completed_at != null ? Number(row.completed_at) : undefined,
    signature: row.signature ?? undefined,

    target: row.target ?? undefined,
    key: row.cfg_key ?? undefined,
    value: row.cfg_value ?? undefined,

    evidence: row.evidence ?? undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : nowMs(),
  };
}

// ✅ onchain verify helper
async function verifySetConfigOnchain(params: {
  chainId: number;
  target: string;
  key: string;
  value: string;
}): Promise<boolean> {
  // this demo is for Ethereum mainnet only
  if (params.chainId !== 1) return false;
  if (!isAddress(params.target)) return false;

  const k = BigInt(params.key);
  const expected = BigInt(params.value);

  const current = await publicClient.readContract({
    address: params.target as `0x${string}`,
    abi: demoConfigAbi,
    functionName: "getConfig",
    args: [k],
  });

  return BigInt(current as any) === expected;
}

async function main() {
  await ensureSchema();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", async (_req, res) => {
    try {
      const r = await pool.query("SELECT 1 as ok");
      res.json({ ok: true, db: r.rows?.[0]?.ok === 1, time: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message ?? "db error" });
    }
  });

  /**
   * GET /tasks/:chainId/:agreementId
   * Возвращаем completed ТОЛЬКО если onchain verify прошёл.
   */
  app.get("/tasks/:chainId/:agreementId", async (req, res) => {
    const chainId = Number(req.params.chainId);
    const agreementId = Number(req.params.agreementId);

    if (!Number.isFinite(chainId) || chainId <= 0) {
      return res.status(400).json({ error: "bad chainId" });
    }
    if (!Number.isFinite(agreementId) || agreementId < 0) {
      return res.status(400).json({ error: "bad agreementId" });
    }

    const q = await pool.query(
      `SELECT * FROM tasks WHERE chain_id=$1 AND agreement_id=$2 LIMIT 1`,
      [chainId, agreementId]
    );

    if (q.rowCount === 0) {
      const pending: TaskRecord = {
        chainId,
        agreementId,
        status: "pending",
        updatedAt: nowMs(),
      };
      return res.json(pending);
    }

    const rec = rowToRecord(q.rows[0]);

    // disputed = hard stop
    if (rec.status === "disputed") {
      return res.json(rec);
    }

    // если не хватает полей задачи — не можем проверить, значит pending
    if (
      !rec.worker ||
      !rec.txHash ||
      !rec.completedAt ||
      !rec.signature ||
      !rec.target ||
      rec.key == null ||
      rec.value == null
    ) {
      return res.json({ ...rec, status: "pending" as const });
    }

    // ✅ verify signature (API как источник истины)
    try {
      const msg = buildCompletionMessage({
        chainId: rec.chainId,
        agreementId: rec.agreementId,
        target: rec.target,
        key: rec.key,
        value: rec.value,
        txHash: rec.txHash,
        completedAt: rec.completedAt,
      });

      const sigOk = await verifyMessage({
        address: rec.worker as `0x${string}`,
        message: msg,
        signature: rec.signature as `0x${string}`,
      });

      if (!sigOk) {
        return res.json({ ...rec, status: "pending" as const });
      }
    } catch {
      return res.json({ ...rec, status: "pending" as const });
    }

    // ✅ onchain verify
    try {
      const ok = await verifySetConfigOnchain({
        chainId: rec.chainId,
        target: rec.target,
        key: rec.key,
        value: rec.value,
      });

      if (!ok) {
        return res.json({ ...rec, status: "pending" as const });
      }

      // ✅ кэшируем completed в БД
      if (rec.status !== "completed") {
        await pool.query(
          `UPDATE tasks SET status='completed', updated_at=NOW() WHERE chain_id=$1 AND agreement_id=$2`,
          [rec.chainId, rec.agreementId]
        );
      }

      return res.json({ ...rec, status: "completed" as const });
    } catch {
      // если RPC упал — лучше вернуть pending
      return res.json({ ...rec, status: "pending" as const });
    }
  });

  /**
   * POST /tasks/complete
   * worker фиксирует completion + params (target/key/value)
   */
  app.post("/tasks/complete", requireApiKey, async (req, res) => {
    const body = req.body ?? {};

    const chainId = Number(body.chainId);
    const agreementId = Number(body.agreementId);
    const worker = typeof body.worker === "string" ? body.worker : "";
    const txHash = typeof body.txHash === "string" ? body.txHash : "";
    const completedAt = Number(body.completedAt);
    const signature = typeof body.signature === "string" ? body.signature : "";
    const evidence = typeof body.evidence === "string" ? body.evidence : undefined;

    const target = typeof body.target === "string" ? body.target : "";
    const keyStr = toBigIntString(body.key);
    const valueStr = toBigIntString(body.value);

    if (!Number.isFinite(chainId) || chainId <= 0) return res.status(400).json({ error: "bad chainId" });
    if (!Number.isFinite(agreementId) || agreementId < 0) return res.status(400).json({ error: "bad agreementId" });
    if (!isAddress(worker)) return res.status(400).json({ error: "bad worker address" });
    if (!isTxHash(txHash)) return res.status(400).json({ error: "bad txHash" });
    if (!Number.isFinite(completedAt) || completedAt <= 0) return res.status(400).json({ error: "bad completedAt" });
    if (!isHex(signature)) return res.status(400).json({ error: "bad signature" });

    if (!isAddress(target)) return res.status(400).json({ error: "bad target address" });
    if (keyStr == null) return res.status(400).json({ error: "bad key" });
    if (valueStr == null) return res.status(400).json({ error: "bad value" });

    const workerLc = worker.toLowerCase();
    const txHashLc = txHash.toLowerCase();
    const sigLc = signature.toLowerCase();
    const targetLc = target.toLowerCase();

    await pool.query(
      `
      INSERT INTO tasks (chain_id, agreement_id, status, worker, tx_hash, completed_at, signature, target, cfg_key, cfg_value, evidence, updated_at)
      VALUES ($1,$2,'pending',$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT (chain_id, agreement_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        worker = EXCLUDED.worker,
        tx_hash = EXCLUDED.tx_hash,
        completed_at = EXCLUDED.completed_at,
        signature = EXCLUDED.signature,
        target = EXCLUDED.target,
        cfg_key = EXCLUDED.cfg_key,
        cfg_value = EXCLUDED.cfg_value,
        evidence = EXCLUDED.evidence,
        updated_at = NOW()
      `,
      [chainId, agreementId, workerLc, txHashLc, completedAt, sigLc, targetLc, keyStr, valueStr, evidence ?? null]
    );

    const q = await pool.query(`SELECT * FROM tasks WHERE chain_id=$1 AND agreement_id=$2 LIMIT 1`, [chainId, agreementId]);
    const rec = rowToRecord(q.rows[0]);
    return res.json({ ok: true, task: rec });
  });

  /**
   * POST /tasks/dispute
   */
  app.post("/tasks/dispute", requireApiKey, async (req, res) => {
    const body = req.body ?? {};
    const chainId = Number(body.chainId);
    const agreementId = Number(body.agreementId);

    if (!Number.isFinite(chainId) || chainId <= 0) return res.status(400).json({ error: "bad chainId" });
    if (!Number.isFinite(agreementId) || agreementId < 0) return res.status(400).json({ error: "bad agreementId" });

    await pool.query(
      `UPDATE tasks SET status='disputed', updated_at=NOW() WHERE chain_id=$1 AND agreement_id=$2`,
      [chainId, agreementId]
    );

    const q = await pool.query(`SELECT * FROM tasks WHERE chain_id=$1 AND agreement_id=$2 LIMIT 1`, [chainId, agreementId]);
    if (q.rowCount === 0) return res.json({ ok: true });

    return res.json({ ok: true, task: rowToRecord(q.rows[0]) });
  });

  /**
   * GET /tasks (admin list)
   */
  app.get("/tasks", requireApiKey, async (_req, res) => {
    const q = await pool.query(`SELECT * FROM tasks ORDER BY updated_at DESC LIMIT 200`);
    res.json({ ok: true, tasks: q.rows.map(rowToRecord) });
  });

  const port = Number(process.env.PORT || 3000);
  app.listen(port, "0.0.0.0", () => {
    console.log(`✅ Task API listening on 0.0.0.0:${port}`);
  });
}

main().catch((e) => {
  console.error("❌ API failed:", e);
  process.exit(1);
});
