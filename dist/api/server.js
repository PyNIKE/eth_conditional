"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
function nowMs() {
    return Date.now();
}
function isHex(s) {
    return typeof s === "string" && /^0x[0-9a-fA-F]*$/.test(s);
}
function isAddress(addr) {
    return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}
function isTxHash(h) {
    return typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h);
}
function key(chainId, agreementId) {
    return `${chainId}:${agreementId}`;
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "256kb" }));
// In-memory storage for demo (key = `${chainId}:${agreementId}`)
const db = new Map();
/**
 * Health
 */
app.get("/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});
/**
 * GET /tasks/:chainId/:agreementId
 * If not found -> return pending (not 404) to simplify workflow logic.
 */
app.get("/tasks/:chainId/:agreementId", (req, res) => {
    const chainId = Number(req.params.chainId);
    const agreementId = Number(req.params.agreementId);
    if (!Number.isFinite(chainId) || chainId <= 0) {
        return res.status(400).json({ error: "bad chainId" });
    }
    if (!Number.isFinite(agreementId) || agreementId < 0) {
        return res.status(400).json({ error: "bad agreementId" });
    }
    const k = key(chainId, agreementId);
    const record = db.get(k);
    if (!record) {
        const pending = {
            chainId,
            agreementId,
            status: "pending",
            updatedAt: nowMs(),
        };
        return res.json(pending);
    }
    return res.json(record);
});
/**
 * POST /tasks/complete
 * Body:
 * {
 *   chainId: 1,
 *   agreementId: 123,
 *   worker: "0x...",
 *   txHash: "0x...",
 *   completedAt: 1730000000,
 *   signature: "0x...",
 *   evidence?: "..."
 * }
 *
 * We store as completed. Signature verification is intentionally done in CRE workflow.
 */
app.post("/tasks/complete", (req, res) => {
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
    const record = {
        chainId,
        agreementId,
        status: "completed",
        worker: worker.toLowerCase(),
        txHash: txHash.toLowerCase(),
        completedAt,
        signature: signature.toLowerCase(),
        evidence,
        updatedAt: nowMs(),
    };
    db.set(key(chainId, agreementId), record);
    return res.json({ ok: true, task: record });
});
/**
 * Optional: mark disputed (so workflow can skip)
 * POST /tasks/dispute
 * { chainId, agreementId, reason? }
 */
app.post("/tasks/dispute", (req, res) => {
    const body = req.body ?? {};
    const chainId = Number(body.chainId);
    const agreementId = Number(body.agreementId);
    if (!Number.isFinite(chainId) || chainId <= 0) {
        return res.status(400).json({ error: "bad chainId" });
    }
    if (!Number.isFinite(agreementId) || agreementId < 0) {
        return res.status(400).json({ error: "bad agreementId" });
    }
    const k = key(chainId, agreementId);
    const existing = db.get(k);
    const record = {
        chainId,
        agreementId,
        status: "disputed",
        worker: existing?.worker,
        txHash: existing?.txHash,
        completedAt: existing?.completedAt,
        signature: existing?.signature,
        evidence: typeof body.reason === "string" ? body.reason : existing?.evidence,
        updatedAt: nowMs(),
    };
    db.set(k, record);
    return res.json({ ok: true, task: record });
});
/**
 * Optional debug endpoint: list records
 */
app.get("/tasks", (_req, res) => {
    res.json({
        count: db.size,
        tasks: Array.from(db.values()),
    });
});
const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, () => {
    console.log(`✅ Task API listening on http://localhost:${PORT}`);
    console.log(`   health: http://localhost:${PORT}/health`);
});
