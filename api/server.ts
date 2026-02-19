import express from "express";
import cors from "cors";
import { Pool } from "pg";

type TaskStatus = "pending" | "completed" | "disputed";

type TaskRecord = {
  chainId: number;
  agreementId: number;
  status: TaskStatus;

  worker?: string;       // address (lowercased)
  txHash?: string;       // 0x...32 bytes
  completedAt?: number;  // unix seconds
  signature?: string;    // 0x...

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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const API_KEY = process.env.API_KEY || ""; // set on Render. If empty, auth is disabled (dev-friendly).

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Render Postgres обычно требует SSL. Внутренний URL на Render часто и так ок без ssl-настроек,
  // но чтобы не ловить сюрпризы — включим совместимый режим:
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      chain_id INT NOT NULL,
      agreement_id BIGINT NOT NULL,
      status TEXT NOT NULL,
      worker TEXT,
      tx_hash TEXT,
      completed_at BIGINT,
      signature TEXT,
      evidence TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (chain_id, agreement_id)
    );
  `);
}

function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!API_KEY) return next(); // local dev mode: allow if not set
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
    evidence: row.evidence ?? undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : nowMs(),
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

/**
 * Health
 * (также полезно проверить БД, чтобы Render healthcheck видел проблемы)
 */
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
 * If not found -> return pending (not 404).
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

  return res.json(rowToRecord(q.rows[0]));
});

/**
 * POST /tasks/complete  (protected)
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

  if (!Number.isFinite(chainId) || chainId <= 0) {
    return res.status(400).json({ error: "bad chainId" });
  }
  if (!Number.isFinite(agreementId) || agreementId < 0) {
    return res.status(400).json({ error: "bad agreementId" });
  }
  if (!isAddress(worker)) {
    return res.status(400).json({ error: "bad worker address" });
  }
  if (!isTxHash(txHash)) {
    return res.status(400).json({ error: "bad txHash" });
  }
  if (!Number.isFinite(completedAt) || completedAt <= 0) {
    return res.status(400).json({ error: "bad completedAt" });
  }
  if (!isHex(signature) || signature.length < 10) {
    return res.status(400).json({ error: "bad signature" });
  }

  const workerLc = worker.toLowerCase();
  const txHashLc = txHash.toLowerCase();
  const sigLc = signature.toLowerCase();

  // Upsert. (chain_id, agreement_id) is PK.
  // Доп. защита: не даем откатывать completed -> pending.
  const up = await pool.query(
    `
    INSERT INTO tasks (chain_id, agreement_id, status, worker, tx_hash, completed_at, signature, evidence, updated_at)
    VALUES ($1,$2,'completed',$3,$4,$5,$6,$7,NOW())
    ON CONFLICT (chain_id, agreement_id)
    DO UPDATE SET
      status = 'completed',
      worker = EXCLUDED.worker,
      tx_hash = EXCLUDED.tx_hash,
      completed_at = EXCLUDED.completed_at,
      signature = EXCLUDED.signature,
      evidence = COALESCE(EXCLUDED.evidence, tasks.evidence),
      updated_at = NOW()
    RETURNING *;
    `,
    [chainId, agreementId, workerLc, txHashLc, completedAt, sigLc, evidence ?? null]
  );

  return res.json({ ok: true, task: rowToRecord(up.rows[0]) });
});

/**
 * POST /tasks/dispute  (protected)
 */
app.post("/tasks/dispute", requireApiKey, async (req, res) => {
  const body = req.body ?? {};
  const chainId = Number(body.chainId);
  const agreementId = Number(body.agreementId);
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  if (!Number.isFinite(chainId) || chainId <= 0) {
    return res.status(400).json({ error: "bad chainId" });
  }
  if (!Number.isFinite(agreementId) || agreementId < 0) {
    return res.status(400).json({ error: "bad agreementId" });
  }

  const up = await pool.query(
    `
    INSERT INTO tasks (chain_id, agreement_id, status, evidence, updated_at)
    VALUES ($1,$2,'disputed',$3,NOW())
    ON CONFLICT (chain_id, agreement_id)
    DO UPDATE SET
      status = 'disputed',
      evidence = COALESCE(EXCLUDED.evidence, tasks.evidence),
      updated_at = NOW()
    RETURNING *;
    `,
    [chainId, agreementId, reason ?? null]
  );

  return res.json({ ok: true, task: rowToRecord(up.rows[0]) });
});

/**
 * Optional debug endpoint: list records (лучше тоже защитить)
 */
app.get("/tasks", requireApiKey, async (_req, res) => {
  const q = await pool.query(`SELECT * FROM tasks ORDER BY updated_at DESC LIMIT 200`);
  res.json({
    count: q.rowCount,
    tasks: q.rows.map(rowToRecord),
  });
});

async function main() {
  await ensureSchema();

  const PORT = Number(process.env.PORT ?? "8787");
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Task API listening on 0.0.0.0:${PORT}`);
  });
}

main().catch((e) => {
  console.error("❌ Failed to start API:", e);
  process.exit(1);
});
