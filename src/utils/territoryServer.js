/* global process */
// 🗺️ 영토 — 서버 쪽 (api/chat.js?action=territory-*). 승패·소유는 서버만 정한다(휴대폰 계산을 믿으면 남의 땅을 가로챌 수 있음).
// db = firebase-admin Firestore. 위치(위도·경도)는 구역을 찾는 데만 쓰고 저장·기록하지 않는다.
// 기록: territories/{행정동코드} = { code, name, level, ownerUid, owner(차지할 때 모습), capturedAt, prevOwnerUid, prevOwnerName, notifiedAt, defenses }
//       territoryTries/{uid}_{코드} = { date, n }  (같은 땅 하루 도전 횟수) — 둘 다 보안 규칙상 앱이 쓸 수 없고 서버만 쓴다
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPlayerFighter } from "../data/battle/engine.js";
import { normalizeGear, gearBonus, makeItem, rollRarity, npcRarityWeights } from "./gear.js";
import { TIERS, TRIES_PER_DAY, regionTier, keeperLevel, keeperDef, ownerDef, snapshotOf, runAutoBattle, decodeRegions, locateRegion, territoryFame } from "./territory.js";

let REGIONS = null;
let Q = 1e5;
function regions() {
  if (!REGIONS) {
    const data = JSON.parse(readFileSync(join(process.cwd(), "api", "_data", "regions.json"), "utf8"));
    Q = data.q || 1e5;
    REGIONS = decodeRegions(data);
  }
  return REGIONS;
}
export const _setRegionsForTest = (data) => { Q = data.q || 1e5; REGIONS = decodeRegions(data); };

const kstDate = (ms = Date.now()) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const num = (v) => (typeof v === "number" ? v : Number(v));
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v ? new Date(v).getTime() : null);

function locate(body) {
  const lat = num(body?.lat), lng = num(body?.lng);
  const r = locateRegion(regions(), lat, lng, Q);
  return r;
}

function defenderOf(code, name, doc) {
  if (doc?.ownerUid && doc.owner) return { def: ownerDef(code, doc.owner), ownerUid: doc.ownerUid };
  return { def: keeperDef(code, name), ownerUid: null };
}
const publicDefender = (def, doc, uid) => ({
  name: def.name, level: def.level, emoji: def.emoji, energyMax: def.energyMax, stats: def.stats, trait: def.trait?.label || null,
  isOwner: !!doc?.ownerUid, mine: !!doc?.ownerUid && doc.ownerUid === uid,
  capturedAtMs: tsMs(doc?.capturedAt), defenses: doc?.defenses || 0,
});
const regionInfo = (code, name) => {
  const tier = regionTier(name);
  return { code, name, tier, tierLabel: TIERS[tier].label, level: keeperLevel(code, name) };
};

// 지금 있는 구역과 지킴이 (도전 전 보기)
export async function territoryHere(db, uid, body = {}, now = Date.now()) {
  const r = locate(body);
  if (!r) return { status: 400, body: { error: "남한 안의 읍·면·동에서만 할 수 있어요" } };
  const [snap, tries] = await Promise.all([
    db.doc(`territories/${r.code}`).get(),
    db.doc(`territoryTries/${uid}_${r.code}`).get(),
  ]);
  const doc = snap.exists ? snap.data() : null;
  const { def } = defenderOf(r.code, r.name, doc);
  const t = tries.exists ? tries.data() : null;
  const used = t?.date === kstDate(now) ? t.n || 0 : 0;
  return { status: 200, body: { region: regionInfo(r.code, r.name), defender: publicDefender(def, doc, uid), triesLeft: Math.max(0, TRIES_PER_DAY - used) } };
}

// 도전 — 그 구역에 지금 있어야 한다. 서버가 끝까지 자동으로 싸우고, 이기면 내 땅
export async function territoryChallenge(db, uid, body = {}, now = Date.now(), rand = Math.random) {
  const r = locate(body);
  if (!r) return { status: 400, body: { error: "남한 안의 읍·면·동에서만 할 수 있어요" } };
  const tRef = db.doc(`territories/${r.code}`);
  const triesRef = db.doc(`territoryTries/${uid}_${r.code}`);
  const [tSnap, rankSnap, setSnap] = await Promise.all([
    tRef.get(), db.doc(`rankings/${uid}`).get(), db.doc(`users/${uid}/data/settings`).get(),
  ]);
  const before = tSnap.exists ? tSnap.data() : null;
  if (before?.ownerUid === uid) return { status: 409, body: { error: "이미 내 영토예요" } };
  const s = setSnap.exists ? setSnap.data() : {};
  const totalScore = Number(rankSnap.exists ? rankSnap.data().totalScore : 0) || 0;
  const player = createPlayerFighter(totalScore, s.statXp || {}, gearBonus(normalizeGear(s.battleGear)));
  const { def } = defenderOf(r.code, r.name, before);
  const today = kstDate(now);

  // 하루 횟수 먼저 센다 (지면 그대로 1회 사용)
  const allowed = await db.runTransaction(async (tx) => {
    const t = await tx.get(triesRef);
    const d = t.exists ? t.data() : null;
    const used = d?.date === today ? d.n || 0 : 0;
    if (used >= TRIES_PER_DAY) return false;
    tx.set(triesRef, { date: today, n: used + 1 });
    return used + 1;
  });
  if (!allowed) return { status: 429, body: { error: `이 땅은 오늘 ${TRIES_PER_DAY}번 모두 도전했어요. 내일 다시 와요` } };

  const result = runAutoBattle(player, def);
  const triesLeft = TRIES_PER_DAY - allowed;
  const base = { region: regionInfo(r.code, r.name), defender: publicDefender(def, before, uid), rounds: result.rounds, log: result.log, frames: result.frames, fighters: result.fighters, triesLeft };

  if (!result.won) {
    // 다른 사람이 지킨 땅이면 "지켜 낸 횟수" +1
    if (before?.ownerUid) await db.runTransaction(async (tx) => { const c = await tx.get(tRef); if (c.exists && c.data().ownerUid === before.ownerUid) tx.update(tRef, { defenses: (c.data().defenses || 0) + 1 }); }).catch(() => {});
    return { status: 200, body: { ...base, won: false } };
  }

  // 그 사이 주인이 바뀌지 않았을 때만 차지 (동시에 이긴 두 사람 중 한 명만)
  const nickname = String(s.battleNickname || "").trim();
  const captured = await db.runTransaction(async (tx) => {
    const cur = await tx.get(tRef);
    const c = cur.exists ? cur.data() : null;
    if ((c?.ownerUid || null) !== (before?.ownerUid || null) || tsMs(c?.capturedAt) !== tsMs(before?.capturedAt)) return false;
    tx.set(tRef, {
      code: r.code, name: r.name, level: keeperLevel(r.code, r.name),
      ownerUid: uid, owner: snapshotOf(player, nickname), capturedAt: new Date(now), // firebase-admin이 Timestamp로 저장 (FieldValue를 안 써서 테스트에서도 같은 코드)
      prevOwnerUid: before?.ownerUid || null, prevOwnerName: before?.owner?.name || null, notifiedAt: null, defenses: 0,
    });
    return true;
  });
  if (!captured) return { status: 200, body: { ...base, won: true, captured: false, note: "이겼지만 그 사이 다른 사람이 먼저 차지했어요. 다시 도전해 보세요" } };

  // 보상 장비 — 지킴이 레벨 기준 등급 (가방은 앱이 넣는다)
  const reward = makeItem(rollRarity(rand(), npcRarityWeights(def.level)), rand);
  return { status: 200, body: { ...base, won: true, captured: true, reward, lostFrom: before?.ownerUid ? (before.owner?.name || "누군가") : null } };
}

// 🗺️ 전국 지도·영토 순위 (2026-11-09) — 주인 있는 땅만 (빈 땅은 화면이 지킴이를 계산)
// 계정 id는 내보내지 않고 색을 정할 짧은 키(k)·닉네임만. 순위는 땅 수 → 영토 명성 순
const ownerKey = (uid) => { let h = 2166136261; for (const c of String(uid)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export async function allTerritories(db, uid, now = Date.now()) {
  const snap = await db.collection("territories").where("ownerUid", "!=", null).limit(4000).get();
  const list = [];
  const byOwner = new Map();
  for (const d of snap.docs) {
    const t = d.data();
    if (!t.ownerUid) continue;
    const at = tsMs(t.capturedAt);
    const name = t.owner?.name || "이름 없는 영주";
    list.push({ c: t.code, l: t.level, o: name, k: ownerKey(t.ownerUid), m: t.ownerUid === uid, d: t.defenses || 0, t: at });
    const o = byOwner.get(t.ownerUid) || { name, k: ownerKey(t.ownerUid), mine: t.ownerUid === uid, count: 0, items: [] };
    o.count++; o.items.push({ level: t.level, capturedAtMs: at });
    byOwner.set(t.ownerUid, o);
  }
  const ranking = [...byOwner.values()]
    .map((o) => ({ name: o.name, k: o.k, mine: o.mine, count: o.count, fame: territoryFame(o.items, now) }))
    .sort((a, b) => b.count - a.count || b.fame - a.fame)
    .slice(0, 50);
  return { status: 200, body: { list, ranking } };
}

// 내 영토 목록
export async function myTerritories(db, uid) {
  const snap = await db.collection("territories").where("ownerUid", "==", uid).limit(500).get();
  const list = snap.docs.map((d) => {
    const t = d.data();
    return { code: t.code, name: t.name, level: t.level, capturedAtMs: tsMs(t.capturedAt), defenses: t.defenses || 0 };
  }).sort((a, b) => (b.capturedAtMs || 0) - (a.capturedAtMs || 0));
  return { status: 200, body: { list } };
}
