// 🗺️ 영토 서버 판정 (2026-11-09) — 실제 서버 코드(src/utils/territoryServer.js, api/chat.js?action=territory-*)를 에뮬레이터에 붙여 실행.
// 위치 → 구역, 하루 3번, 이기면 차지·차지할 때 모습 저장, 내 땅 재도전 막기, 다른 사람이 빼앗기, 동시에 이긴 경우 한 명만.
import { readFileSync } from 'node:fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!getApps().length) initializeApp({ projectId: 'demo-daymate' });
const db = getFirestore();
const S = await import('../../../src/utils/territoryServer.js');
S._setRegionsForTest(JSON.parse(readFileSync(new URL('../../../api/_data/regions.json', import.meta.url), 'utf8')));

const results = [];
const t = (name, ok, detail = '') => results.push(ok ? `PASS ${name}` : `FAIL ${name}${detail ? ` — ${detail}` : ''}`);

// 테스트 데이터 지우기 (이 파일이 만드는 것만)
for (const c of ['territories', 'territoryTries', 'rankings']) {
  const snap = await db.collection(c).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
const BIG = { STR: 200000, INT: 200000, WEALTH: 200000, REL: 200000, ACHIEVE: 200000, LIFE: 200000 };
const user = async (uid, totalScore, statXp, nick) => {
  await db.doc(`rankings/${uid}`).set({ totalScore });
  await db.doc(`users/${uid}/data/settings`).set({ statXp, battleNickname: nick });
};
await user('strong1', 3000000, BIG, '강한1');
await user('strong2', 3000000, BIG, '강한2');
await user('weak', 0, {}, '약한');

const SAJIK = { lat: 37.5759, lng: 126.9688 }; // 서울 종로구 사직동
const CODE = '1111053000';
const NOW = Date.parse('2026-11-09T03:00:00Z');

let r = await S.territoryHere(db, 'weak', SAJIK, NOW);
t('위치 → 사직동, 기본 지킴이, 남은 도전 3', r.status === 200 && r.body.region.code === CODE && !r.body.defender.isOwner && r.body.triesLeft === 3, JSON.stringify(r.body?.region));
t('좌표는 응답에 다시 담지 않음', !JSON.stringify(r.body).includes('126.9688'));
r = await S.territoryHere(db, 'weak', { lat: 35.0, lng: 125.0 }, NOW);
t('바다는 400', r.status === 400);
r = await S.territoryHere(db, 'weak', { lat: 'x', lng: null }, NOW);
t('잘못된 값은 400', r.status === 400);

r = await S.territoryChallenge(db, 'strong1', SAJIK, NOW);
t('강한 사람이 기본 지킴이를 이기고 차지', r.status === 200 && r.body.won && r.body.captured && !r.body.lostFrom, JSON.stringify({ s: r.status, w: r.body?.won, c: r.body?.captured }));
t('보상 장비 1개', !!r.body.reward?.rarity && !!r.body.reward?.name);
let doc = (await db.doc(`territories/${CODE}`).get()).data();
t('영토 기록: 주인·차지할 때 모습·땅 레벨', doc.ownerUid === 'strong1' && doc.owner.name === '강한1' && doc.owner.energyMax >= 3000000 && doc.level === 14 && doc.prevOwnerUid === null && !!doc.capturedAt?.toMillis);
t('영토 기록에 위치(좌표) 없음', !JSON.stringify(doc).includes('126.96'));

r = await S.territoryChallenge(db, 'strong1', SAJIK, NOW);
t('내 땅에는 다시 도전 못 함 (409)', r.status === 409);

r = await S.territoryHere(db, 'weak', SAJIK, NOW);
t('다른 사람이 보면 주인 이름', r.body.defender.isOwner && r.body.defender.name === '강한1' && !r.body.defender.mine);
r = await S.territoryHere(db, 'strong1', SAJIK, NOW);
t('주인이 보면 내 땅', r.body.defender.mine === true);

r = await S.territoryChallenge(db, 'weak', SAJIK, NOW);
t('약한 사람은 지고 땅은 그대로', r.status === 200 && !r.body.won && r.body.triesLeft === 2);
doc = (await db.doc(`territories/${CODE}`).get()).data();
t('지켜 낸 횟수 +1', doc.ownerUid === 'strong1' && doc.defenses === 1);
await S.territoryChallenge(db, 'weak', SAJIK, NOW);
await S.territoryChallenge(db, 'weak', SAJIK, NOW);
r = await S.territoryChallenge(db, 'weak', SAJIK, NOW);
t('같은 땅 하루 3번까지 (4번째 429)', r.status === 429);
r = await S.territoryChallenge(db, 'weak', SAJIK, NOW + 86400000);
t('다음 날은 다시 도전', r.status === 200);

r = await S.myTerritories(db, 'strong1');
t('내 영토 목록', r.body.list.length === 1 && r.body.list[0].code === CODE && r.body.list[0].level === 14);

// 다른 강한 사람이 빼앗기 — 이전 주인 기록
r = await S.territoryChallenge(db, 'strong2', SAJIK, NOW + 1000);
doc = (await db.doc(`territories/${CODE}`).get()).data();
const fair = r.body.won && r.body.captured;
t('빼앗으면 이전 주인·알림 대상 기록 (비등하면 질 수도 있음)', !fair || (doc.ownerUid === 'strong2' && doc.prevOwnerUid === 'strong1' && doc.prevOwnerName === '강한1' && doc.notifiedAt === null && r.body.lostFrom === '강한1'), JSON.stringify({ won: r.body.won, owner: doc.ownerUid }));

// 동시에 이긴 경우 한 명만 — 빈 땅에 강한 두 사람이 동시에
const HAEUNDAE = { lat: 35.1587, lng: 129.1604 };
const [a, b] = await Promise.all([S.territoryChallenge(db, 'strong1', HAEUNDAE, NOW), S.territoryChallenge(db, 'strong2', HAEUNDAE, NOW)]);
const caps = [a, b].filter((x) => x.body.captured).length;
t('동시에 이겨도 한 명만 차지', caps === 1 && [a, b].every((x) => x.body.won), JSON.stringify([a.body.captured, b.body.captured]));

// 전국 지도·영토 순위 — 주인 있는 땅만, 계정 id는 내보내지 않음
const ownerNow = (await db.doc(`territories/${CODE}`).get()).data().ownerUid; // 비등한 강자끼리라 누가 가졌는지는 그때그때 다름
const all = await S.allTerritories(db, ownerNow, NOW + 2000);
const allJson = JSON.stringify(all.body);
t('지도: 주인 있는 땅 목록·내 땅 표시', all.status === 200 && all.body.list.length >= 2 && all.body.list.every((x) => x.c && x.o && x.k && typeof x.m === 'boolean') && all.body.list.some((x) => x.m), allJson.slice(0, 200));
t('지도: 계정 id(uid)는 응답에 없음', !allJson.includes('strong1') && !allJson.includes('strong2') && !allJson.includes('ownerUid'));
const owners = new Set(all.body.list.map((x) => x.k));
t('순위: 땅 수 순, 사람마다 한 줄', all.body.ranking.length === owners.size && (all.body.ranking.length < 2 || all.body.ranking[0].count >= all.body.ranking[1].count) && all.body.ranking.filter((r) => r.mine).length === 1);

// 사람이 차지한 땅의 강함은 차지할 때 그대로 (나중에 성장해도)
await user('strong1', 9000000, BIG, '강한1');
const owner = (await db.doc(`territories/${CODE}`).get()).data();
t('차지할 때 모습 고정 (나중 성장 반영 안 됨)', owner.ownerUid !== 'strong1' || owner.owner.energyMax < 9000000);

console.log(results.join('\n'));
const failed = results.filter((x) => x.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
