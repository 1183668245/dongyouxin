const AVATAR_NAMES = ["特朗普", "马斯克", "库克", "拉里·芬克", "史蒂芬·施瓦茨曼", "凯利·奥特伯格", "布赖恩·赛克斯", "简·弗雷泽", "吉姆·安德森", "H·劳伦斯·卡尔普", "大卫·所罗门", "雅各布·泰森", "迈克尔·米巴赫", "迪娜·鲍威尔", "桑杰·梅赫罗特拉", "克里斯蒂亚诺·阿蒙", "瑞安·麦金纳尼", "黄仁勋"];

function formatPairLabel(firstAvatar, secondAvatar) {
  return `${AVATAR_NAMES[Number(firstAvatar)] ?? firstAvatar} · ${AVATAR_NAMES[Number(secondAvatar)] ?? secondAvatar}`;
}

export function createHistoryService({ vault }) {
  async function getDrawHistory({ limit = 100 } = {}) {
    const currentRoundId = await vault.currentRoundId();
    const start = currentRoundId > 0n ? currentRoundId - 1n : 0n;
    const count = Number(limit);

    const ids = [];
    for (let i = 0; i < count; i++) {
      const id = start - BigInt(i);
      if (id < 0n) break;
      ids.push(id);
    }

    const rounds = await Promise.all(
      ids.map(async (id) => {
        const r = await vault.rounds(id);
        const resolved = Boolean(r.resolved);
        const winningTicketId = Number(r.winningTicketId);
        let firstAvatar = null;
        let secondAvatar = null;
        let winningPairLabel = null;
        if (resolved) {
          [firstAvatar, secondAvatar] = await vault.decodeTicket(r.winningTicketId);
          firstAvatar = Number(firstAvatar);
          secondAvatar = Number(secondAvatar);
          winningPairLabel = formatPairLabel(firstAvatar, secondAvatar);
        }
        return {
          roundId: id.toString(),
          startTime: Number(r.startTime),
          endTime: Number(r.endTime),
          resolved,
          winningTicketId,
          firstAvatar,
          secondAvatar,
          winningPairLabel,
        };
      })
    );

    const resolvedRounds = rounds.filter((r) => r.resolved);
    return { currentRoundId: currentRoundId.toString(), items: resolvedRounds };
  }

  return { getDrawHistory };
}