import express from "express";
import { ethers } from "ethers";

export function createRoutes({ rankService, historyService, config, db }) {
  const router = express.Router();

  router.get("/health", (req, res) => {
    res.json({
      ok: true,
      vaultAddress: config.vaultAddress,
    });
  });

  router.get("/ranks", async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const data = await rankService.getRanks({ limit });
    res.json(data);
  });

  router.post("/players/register", (req, res) => {
    const address = req.body?.address;
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ ok: false, error: "Invalid address" });
    }

    const normalized = ethers.getAddress(address);
    const inserted = db.registerPlayer(normalized);
    db.save();
    res.json({ ok: true, address: normalized, inserted });
  });

  router.get("/history/draws", async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const data = await historyService.getDrawHistory({ limit });
    res.json(data);
  });

  router.get("/live-feed", (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    res.json({ ok: true, items: db.listLiveFeed(limit) });
  });

  router.get("/relief/claim/:address", (req, res) => {
    const address = req.params.address;
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ ok: false, error: "Invalid address" });
    }
    const normalized = ethers.getAddress(address);
    const epochIdQuery = req.query.epochId ? Number(req.query.epochId) : null;

    const epochs = [];
    const sql = epochIdQuery !== null
      ? "SELECT * FROM holder_relief_epochs WHERE epoch_id = ? ORDER BY epoch_id DESC"
      : "SELECT * FROM holder_relief_epochs WHERE settled = 1 ORDER BY epoch_id DESC";
    const stmt = db.db.prepare(sql);
    if (epochIdQuery !== null) stmt.bind([epochIdQuery]);
    while (stmt.step()) epochs.push(stmt.getAsObject());
    stmt.free();

    if (!epochs.length) {
      return res.status(404).json({ ok: false, error: "No settled relief epoch found in database" });
    }

    const matched = [];
    for (const epoch of epochs) {
      if (!epoch.merkle_root || epoch.merkle_root === ethers.ZeroHash) continue;
      const claim = db.getReliefClaim(epoch.epoch_id, normalized) || db.getReliefClaim(epoch.epoch_id, normalized.toLowerCase());
      if (!claim) continue;
      matched.push({
        epochId: epoch.epoch_id,
        amountWei: claim.amount_wei,
        proof: JSON.parse(claim.proof_json)
      });
    }

    if (!matched.length) {
      return res.status(404).json({ ok: false, error: epochIdQuery !== null ? "Address not eligible for this epoch" : "Address not eligible for any settled relief epoch" });
    }

    const latest = matched[0];
    res.json({
      ok: true,
      epochId: latest.epochId,
      amountWei: latest.amountWei,
      proof: latest.proof,
      claims: matched
    });
  });

  return router;
}

