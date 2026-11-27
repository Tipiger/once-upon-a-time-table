// Pure state transitions. Apply each change through updateSaved before rendering it.
function requireState(condition, message) {
  if (!condition) throw new Error(message);
}
const whole = n => Number.isSafeInteger(n) && n >= 0;
const positive = n => whole(n) && n > 0;

function shuffle(ids) {
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

export function startGame(module, { seats, stories, endings = 2 }) {
  requireState(positive(seats) && seats >= 2 && positive(stories) && positive(endings), '请检查人数和每人起始牌数');
  const ids = new Set();
  const decks = { story: [], ending: [] };
  for (const card of module.cards) {
    requireState(typeof card.id === 'string' && card.id && !ids.has(card.id) && ['ending','story'].includes(card.kind), '牌库编号或类型无效');
    ids.add(card.id);
    decks[card.kind].push(card.id);
  }
  requireState(seats * stories <= decks.story.length && seats * endings <= decks.ending.length, '牌库不够开局');
  shuffle(decks.story);
  shuffle(decks.ending);
  const host = { game: crypto.randomUUID(), module: module.moduleId, seats, decks, history: [] };
  for (let seat = 1; seat <= seats; seat++) deal(host, seat, stories, endings, true);
  for (const packet of host.history) {
    packet.v = 2;
    packet.reserve = { story: [], ending: [] };
  }
  for (const kind of ['story', 'ending']) {
    // A random starting seat shares out any remainder fairly between games.
    const first = Math.floor(Math.random() * seats);
    decks[kind].forEach((id, i) => host.history[(first + i) % seats].reserve[kind].push(id));
    decks[kind] = [];
  }
  return host;
}

// Mutates only a newly created host state or a private clone.
function deal(host, seat, stories, endings, opening) {
  requireState(positive(seat) && seat <= host.seats, '座位号无效');
  requireState(whole(stories) && whole(endings) && stories + endings > 0, '发牌数量无效');
  requireState(stories <= host.decks.story.length && endings <= host.decks.ending.length, '剩余牌数不足');
  host.history.push({
    v: 1, game: host.game, module: host.module, seat, serial: host.history.length + 1, opening,
    cards: [...host.decks.story.splice(0, stories), ...host.decks.ending.splice(0, endings)]
  });
}

export function issue(host, seat, stories, endings = 0) {
  requireState(!host.history[0]?.reserve, '本局请从个人补牌堆补牌');
  const next = structuredClone(host);
  deal(next, seat, stories, endings, false);
  return next;
}

// Reuse the same history entry to redisplay a code. No additional cards are drawn.
export function transferLink(pageUrl, packet) {
  const url = new URL(pageUrl);
  if (packet.v === 2) {
    const ids = list => list.map(encodeURIComponent).join(',');
    const fields = ['2', encodeURIComponent(packet.game), encodeURIComponent(packet.module),
      packet.seat, ids(packet.cards), ids(packet.reserve.story), ids(packet.reserve.ending)];
    url.searchParams.set('v', 'draw-art-1');
    url.hash = 'deal=' + fields.join('/');
  } else {
    url.hash = 'deal=' + encodeURIComponent(JSON.stringify(packet));
  }
  return url.href;
}
export function readLink(pageUrl) {
  const hash = new URL(pageUrl).hash;
  requireState(hash.startsWith('#deal='), '链接中没有领牌信息');
  const payload = hash.slice(6);
  if (payload.startsWith('2/')) {
    const fields = payload.split('/');
    requireState(fields.length === 7, '领牌链接不完整');
    const ids = value => value ? value.split(',').map(decodeURIComponent) : [];
    const seat = Number(fields[3]);
    return { v: 2, game: decodeURIComponent(fields[1]), module: decodeURIComponent(fields[2]),
      seat, serial: seat, opening: true, cards: ids(fields[4]),
      reserve: { story: ids(fields[5]), ending: ids(fields[6]) } };
  }
  return JSON.parse(decodeURIComponent(payload));
}

export function receive(player, packet, module) {
  requireState((packet?.v === 1 || packet?.v === 2) && typeof packet.game === 'string' && packet.game.length > 0 &&
    packet.module === module.moduleId && positive(packet.serial) && positive(packet.seat) &&
    typeof packet.opening === 'boolean' && Array.isArray(packet.cards) && packet.cards.length > 0, '领牌信息无效或模组不匹配');
  requireState(player || packet.opening, '请先领取起手牌');
  if (packet.v === 2) {
    requireState(packet.opening && packet.serial === packet.seat &&
      Array.isArray(packet.reserve?.story) && Array.isArray(packet.reserve?.ending), '个人补牌堆格式无效');
    const kinds = new Map(module.cards.map(c => [c.id, c.kind]));
    for (const kind of ['story', 'ending']) {
      requireState(packet.reserve[kind].every(id => kinds.get(id) === kind), '补牌类型无效');
    }
    const ids = [...packet.cards, ...packet.reserve.story, ...packet.reserve.ending];
    requireState(new Set(ids).size === ids.length, '起手牌与补牌堆含有重复卡牌');
  }
  const cardIds = new Set(module.cards.map(c => c.id));
  requireState(packet.cards.every(id => cardIds.has(id)) && new Set(packet.cards).size === packet.cards.length, '牌号无效或重复');
  const state = player ?? { game: packet.game, module: packet.module, seat: packet.seat, hand: [],
    discard: [], received: [], inbox: [], shown: null, confirming: false, wonWith: null };
  requireState(state.game === packet.game && state.module === packet.module && state.seat === packet.seat, '这批牌属于其他牌局或座位');
  if (state.received.includes(packet.serial)) return state;
  requireState(!state.reserve && !state.wonWith && !(player && packet.opening), '当前不能领取这批牌');
  const owned = new Set([...state.hand, ...state.discard, ...state.inbox.flatMap(batch => batch.cards)]);
  requireState(packet.cards.every(id => !owned.has(id)), '这批牌含有已领取的牌');
  return { ...state, ...(packet.v === 2 ? { reserve: structuredClone(packet.reserve) } : {}), received: [...state.received, packet.serial], shown: null, confirming: false,
    inbox: [...state.inbox, { cards: [...packet.cards], opening: packet.opening, revealed: false }] };
}

export function drawLocal(state, stories, endings = 0) {
  requireState(state.reserve && !state.wonWith && !state.shown && !state.inbox.length, '当前无法补牌');
  requireState(whole(stories) && whole(endings) && stories + endings > 0, '补牌数量无效');
  const { story, ending } = state.reserve;
  requireState(story.length >= stories && ending.length >= endings, '个人补牌堆余量不足');
  return {
    ...state,
    reserve: { story: story.slice(stories), ending: ending.slice(endings) },
    inbox: [{ cards: [...story.slice(0, stories), ...ending.slice(0, endings)], opening: false, revealed: false }]
  };
}

export function revealBatch(state) {
  const [batch, ...later] = state.inbox;
  requireState(batch, '没有待翻开的牌');
  return { ...state, inbox: [{ ...batch, revealed: true }, ...later] };
}
export function collectBatch(state) {
  const [batch, ...later] = state.inbox;
  requireState(batch?.revealed, '请先翻开本批卡牌');
  return { ...state, inbox: later, hand: [...state.hand, ...batch.cards] };
}
export function showCard(state, id) {
  requireState(!state.wonWith && !state.inbox.length && !state.shown && state.hand.includes(id), '这张牌当前无法展示');
  return { ...state, shown: id };
}
export function withdraw(state) {
  requireState(state.shown && !state.confirming, '当前无法撤回展示');
  return { ...state, shown: null };
}
export function playShown(state, module) {
  requireState(module.moduleId === state.module && state.shown && !state.confirming, '请先展示手牌');
  const kinds = new Map(module.cards.map(c => [c.id, c.kind]));
  if (kinds.get(state.shown) === 'ending') {
    requireState(state.hand.every(id => kinds.get(id) === 'ending'), '请先出完故事牌');
    return { ...state, confirming: true };
  }
  requireState(kinds.get(state.shown) === 'story', '无效的故事牌');
  return discardShown(state);
}
function discardShown(state) {
  return { ...state, shown: null, confirming: false, hand: state.hand.filter(id => id !== state.shown),
    discard: [...state.discard, state.shown] };
}
export function answerEnding(state, confirm) {
  requireState(state.confirming && typeof confirm === 'boolean', '当前没有待确认的结局');
  return confirm ? { ...discardShown(state), wonWith: state.shown } : { ...state, confirming: false };
}

export function returnToHand(state, id) {
  requireState(state.discard.includes(id) && !state.hand.includes(id), '这张牌已不在弃牌堆');
  requireState(!state.shown && !state.inbox.length, '请先完成当前的卡牌操作');
  requireState(!state.wonWith || state.wonWith === id, '请先收回获胜的结局牌');
  return {
    ...state,
    hand: [...state.hand, id],
    discard: state.discard.filter(cardId => cardId !== id),
    wonWith: null
  };
}

// Use separate host and player keys, e.g. host/<game> and player/<game>.
// Use one player key per game on a device so receive() can reject a different seat.
let connection;
function openStore() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const req = indexedDB.open('once-upon-a-time-table', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('sessions');
    req.onerror = () => { connection = null; reject(req.error); };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
  });
  return connection;
}

// Transition must be synchronous. Concurrent tabs serialize read-modify-write.
export async function updateSaved(key, transition) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', transition ? 'readwrite' : 'readonly');
    const store = tx.objectStore('sessions');
    const read = store.get(key);
    let result, failure;
    read.onsuccess = () => {
      try {
        result = transition ? transition(read.result) : read.result;
        if (transition) store.put(result, key);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error);
  });
}
