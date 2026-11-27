export async function readJSON(path) {
  const result = await fetch(path);
  if (!result.ok) throw Error('无法读取牌库文件：' + path);
  return result.json();
}

// Each stable module ID is also used in saved games and transfer links.
export function catalog(entries, load = readJSON) {
  if (!entries.length || new Set(entries.map(e => e.id)).size !== entries.length)
    throw Error('模组目录为空或编号重复');
  const cache = new Map();
  async function open(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) throw Error('当前站点没有这套模组，请检查领牌网址');
    if (!cache.has(id)) {
      const pending = load(entry.file).then(data => {
        if (data.moduleId !== id) throw Error('牌库与模组编号不匹配');
        const byId = new Map(data.cards.map(card => [card.id, card]));
        if (byId.size !== data.cards.length || data.cards.some(card =>
          !card.id || (card.kind === 'ending' ? !card.textZh?.trim() :
            card.kind !== 'story' || !card.labelZh?.trim() || !card.categoryZh)))
          throw Error('牌库存在重复编号或缺少卡牌文字');
        return { ...data, entry, byId };
      }).catch(error => { cache.delete(id); throw error; });
      cache.set(id, pending);
    }
    return cache.get(id);
  }
  return { entries, open };
}
export function savedModule(table) {
  return table.host?.module ?? table.players[table.mySeat]?.module;
}
