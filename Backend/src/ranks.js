import { ethers } from "ethers";

function toBigIntString(v) {
  return (typeof v === "bigint" ? v : BigInt(v)).toString();
}

async function getStatsForAddress({ vault, address }) {
  const taxTokenAddr = await vault.taxToken();
  const token = taxTokenAddr && taxTokenAddr !== ethers.ZeroAddress
    ? new ethers.Contract(taxTokenAddr, ["function balanceOf(address) view returns (uint256)"], vault.runner)
    : null;
  
  const [stats, claimable, balance] = await Promise.all([
    vault.stats(address),
    vault.claimableBNB(address),
    token ? token.balanceOf(address) : 0n
  ]);
  
  return {
    totalWonBNBWei: toBigIntString(stats.totalWonBNB),
    totalBurnedToken: toBigIntString(stats.totalBurnedToken),
    fortunePoints: toBigIntString(stats.fortunePoints),
    claimableBNBWei: toBigIntString(claimable),
    balanceToken: toBigIntString(balance),
  };
}

function scoreRow(row) {
  return {
    address: row.address,
    totalWonBNBWei: BigInt(row.total_won_bnb_wei),
    totalBurnedToken: BigInt(row.total_burned_token),
    fortunePoints: BigInt(row.fortune_points),
    claimableBNBWei: BigInt(row.claimable_bnb_wei),
    balanceToken: BigInt(row.balance_token || "0"),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

function sortDescBy(key) {
  return (a, b) => (b[key] === a[key] ? a.address.localeCompare(b.address) : b[key] > a[key] ? 1 : -1);
}

export function createRankService({ db, vault, config }) {
  const eoaCache = new Map();

  async function isEOA(address) {
    const normalized = ethers.getAddress(address);
    const key = normalized.toLowerCase();
    if (eoaCache.has(key)) return eoaCache.get(key);
    const code = await vault.runner.provider.getCode(normalized);
    const result = code === "0x";
    eoaCache.set(key, result);
    return result;
  }

  async function ensureCached(addresses) {
    const now = Date.now();
    const ttl = config.statsCacheTtlMs;
    const stale = [];

    for (const addr of addresses) {
      const cached = db.getCachedStats(addr);
      if (!cached) {
        stale.push(addr);
        continue;
      }
      const age = now - Number(cached.updated_at_ms);
      if (age > ttl) stale.push(addr);
    }

    if (!stale.length) return;

    const results = await Promise.all(
      stale.map(async (address) => {
        const stats = await getStatsForAddress({ vault, address });
        return { address, ...stats };
      })
    );

    for (const r of results) {
      db.setCachedStats({
        address: r.address,
        totalWonBNBWei: r.totalWonBNBWei,
        totalBurnedToken: r.totalBurnedToken,
        fortunePoints: r.fortunePoints,
        claimableBNBWei: r.claimableBNBWei,
        balanceToken: r.balanceToken,
        updatedAtMs: now,
      });
    }
    db.save();
  }

  async function getRanks({ limit = 20, addressLimit = 4000 } = {}) {
    // 1. 获取所有已知地址，并只保留 EOA
    const knownAddresses = db.listPlayers(addressLimit).map((p) => ethers.getAddress(p.address));
    const eoaFlags = await Promise.all(knownAddresses.map((address) => isEOA(address)));
    const players = knownAddresses.filter((_, idx) => eoaFlags[idx]);
    const contractExcluded = knownAddresses.length - players.length;
    console.log(`[Ranks] known=${knownAddresses.length} eoa=${players.length} contractExcluded=${contractExcluded}`);
    
    // 2. 确保缓存了数据
    await ensureCached(players);

    // 3. 生成数据行并过滤：只有三项核心数据中有一项 > 0 的地址才进入榜单
    const rows = players
      .map((address) => db.getCachedStats(address))
      .filter(Boolean)
      .map(scoreRow)
      .filter(r => {
        // 门槛：只有参与过购票、中过奖、或有积分的人才进榜
        // 池子因为从不购票，所以它们的这三项全是 0，会被自然过滤
        return r.totalWonBNBWei > 0n || r.totalBurnedToken > 0n || r.fortunePoints > 0n;
      });

    const rich = [...rows].sort(sortDescBy("totalWonBNBWei")).slice(0, limit);
    const burn = [...rows].sort(sortDescBy("totalBurnedToken")).slice(0, limit);
    const fortune = [...rows].sort(sortDescBy("fortunePoints")).slice(0, limit);
    // 持币榜也只在这些活跃地址里排
    const diamond = [...rows].sort(sortDescBy("balanceToken")).slice(0, limit);

    return {
      updatedAtMs: Date.now(),
      counts: { players: rows.length, totalKnownAddresses: knownAddresses.length, totalEOAAddresses: players.length },
      rich: rich.map((r) => ({
        address: r.address,
        totalWonBNB: ethers.formatEther(r.totalWonBNBWei),
        totalWonBNBWei: r.totalWonBNBWei.toString(),
      })),
      burn: burn.map((r) => ({
        address: r.address,
        totalBurnedToken: r.totalBurnedToken.toString(),
      })),
      fortune: fortune.map((r) => ({
        address: r.address,
        fortunePoints: r.fortunePoints.toString(),
      })),
      diamond: diamond.map((r) => ({
        address: r.address,
        balanceToken: r.balanceToken.toString(),
      })),
    };
  }

  return { getRanks };
}

