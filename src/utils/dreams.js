// 🛒 갖고 싶은 것 · 📍 가고 싶은 곳 (2026-11-08 사용자 요청 — "보면서 의욕도 생기고, 까먹지 않게 적어 두고 이루는 목록")
// 두 목록은 모양이 같아 이 파일 한 곳에서 다룬다. 계정 설정 wishes / places 배열(구독과 같은 동기화, 규칙 변경 없음).
// 항목: { id, name, price, link, photo: {url, path} | null, why, when, createdAt, doneAt, done }
// 사진은 users/{uid}/dreams/ 에 원본 비율 그대로(앨범 고르기, 압축만), 링크는 http(s)만.
import { addDays } from './date.js';
import { daysUntil } from './exam.js';

export const DREAM_KINDS = {
  wish: {
    kind: 'wish', settingsKey: 'wishes', storeKey: 'dm_wishes', screen: 'wishes',
    title: '갖고 싶은 것', emoji: '🛒', icon: 'gift',
    namePh: '예: 에어팟 프로, 캠핑 의자', pricePh: '대략 얼마', priceLabel: '가격',
    linkPh: '상품 페이지 주소 (쿠팡·네이버 등)', whyPh: '왜 갖고 싶은지 한 줄', whenLabel: '언제쯤 살까요',
    doneBtn: '샀어요 🎉', doneTitle: '이룬 것', doneToast: '축하해요! 이룬 것에 남겨 둘게요 🎉', empty: '갖고 싶은 걸 사진과 함께 적어 두면 볼 때마다 의욕이 생겨요',
  },
  place: {
    kind: 'place', settingsKey: 'places', storeKey: 'dm_places', screen: 'places',
    title: '가고 싶은 곳', emoji: '📍', icon: 'pin',
    namePh: '예: 제주 오름, 교토 단풍', pricePh: '대략 얼마 들지', priceLabel: '예상 비용',
    linkPh: '지도·블로그 주소', whyPh: '왜 가고 싶은지, 누구랑', whenLabel: '언제쯤 갈까요',
    doneBtn: '다녀왔어요 🎉', doneTitle: '다녀온 곳', doneToast: '다녀왔군요! 다녀온 곳에 남겨 둘게요 🎉', empty: '가고 싶은 곳을 사진과 함께 적어 두면 잊지 않고 계획하게 돼요',
  },
  // 🪣 버킷리스트 (2026-11-08) — 데이터는 예전 그대로 계정 설정 bucketList({id, text, done})에 두고 새 칸만 덧붙인다.
  // 목록은 My 탭 한 줄 목록(보기만), 누르면 같은 상세 창. 화면 전환 없음.
  bucket: {
    kind: 'bucket', settingsKey: 'bucketList', storeKey: 'dm_bucket_list', screen: 'my',
    title: '버킷리스트', emoji: '🪣', icon: 'flag',
    namePh: '예: 오로라 보기, 마라톤 완주', pricePh: '대략 얼마 들지', priceLabel: '예상 비용',
    linkPh: '참고할 주소', whyPh: '왜 해 보고 싶은지', whenLabel: '언제쯤 해 볼까요',
    doneBtn: '해냈어요 🎉', doneTitle: '해낸 것', doneToast: '해냈군요! 해낸 날을 남겨 둘게요 🎉', empty: '죽기 전에 해 보고 싶은 일을 적어 보세요',
  },
};

// 버킷리스트 ↔ 상세 창 모양. 예전 항목(글자·체크만)도 그대로 읽고, 저장할 때 원래 칸은 지키며 새 칸만 덧붙인다.
export function bucketToDream(b) {
  return normalizeDreams([{ ...b, name: b?.text, done: !!b?.done || !!b?.doneAt }])[0] || null;
}
export function dreamToBucket(d, orig = {}) {
  const { name, done, ...rest } = d;
  return { ...orig, ...rest, id: d.id, text: name, done: !!done || !!d.doneAt };
}

export const newDreamId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// 링크는 http(s)만 — 주소만 쓰면 https:// 를 붙이고, javascript: 같은 건 버린다
export function safeLink(v) {
  const s = str(v, 500);
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch { return ''; }
}

export function normalizeDreams(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && str(x.name, 60)).map((x) => {
    const price = Number(x.price);
    return {
      id: str(x.id, 40) || newDreamId(),
      name: str(x.name, 60),
      price: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
      link: safeLink(x.link),
      photo: x.photo?.url ? { url: String(x.photo.url), path: String(x.photo.path || '') } : null,
      why: str(x.why, 200),
      when: isDate(x.when) ? x.when : '',
      createdAt: str(x.createdAt, 30),
      doneAt: isDate(x.doneAt) ? x.doneAt : '',
      // 이룬 날을 모르는 예전 버킷리스트 체크(done만 있음)도 이룬 것으로
      done: isDate(x.doneAt) || x.done === true,
    };
  });
}

// 아직 못 이룬 것은 "언제쯤"이 가까운 순 → 날짜 없는 것(넣은 순), 이룬 것은 최근 순(날짜 모르는 것은 뒤)
export function dreamLists(list) {
  const all = normalizeDreams(list);
  const active = all.filter((x) => !x.done).sort((a, b) => (a.when && b.when ? a.when.localeCompare(b.when) : a.when ? -1 : b.when ? 1 : 0));
  const done = all.filter((x) => x.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  return { active, done, total: active.reduce((s, x) => s + (x.price || 0), 0) };
}

// 오늘 탭 "다가오는 날" — "언제쯤"이 7일 안인 것 (지난 날은 오늘로 보지 않음)
export function upcomingDreamEvents(list, kind, todayStr, within = 7) {
  const cfg = DREAM_KINDS[kind];
  const limit = addDays(todayStr, within);
  return dreamLists(list).active
    .filter((x) => x.when && x.when >= todayStr && x.when <= limit)
    .map((x) => ({ key: `${kind}_${x.id}`, kind: 'dream', dreamKind: kind, id: x.id, title: `${cfg.emoji} ${x.name}`, date: x.when, dday: daysUntil(x.when, todayStr) }));
}

// 이룬 날 — 올해면 월/일, 아니면 연도까지, 모르면(예전 버킷리스트 체크) "날짜 모름"
export const doneDateLabel = (ds, today) => (!ds ? '날짜 모름'
  : ds.slice(0, 4) === today.slice(0, 4) ? `${Number(ds.slice(5, 7))}/${Number(ds.slice(8, 10))}` : ds.replace(/-/g, '.'));

export const fmtWon = (v) => `${Math.round(v).toLocaleString('ko-KR')}원`;
