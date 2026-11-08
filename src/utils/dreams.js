// 🛒 갖고 싶은 것 · 📍 가고 싶은 곳 (2026-11-08 사용자 요청 — "보면서 의욕도 생기고, 까먹지 않게 적어 두고 이루는 목록")
// 두 목록은 모양이 같아 이 파일 한 곳에서 다룬다. 계정 설정 wishes / places 배열(구독과 같은 동기화, 규칙 변경 없음).
// 항목: { id, name, price, link, photo: {url, path} | null, why, when, createdAt, doneAt }
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
};

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
  return (Array.isArray(list) ? list : []).filter((x) => x && str(x.name, 40)).map((x) => {
    const price = Number(x.price);
    return {
      id: str(x.id, 40) || newDreamId(),
      name: str(x.name, 40),
      price: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
      link: safeLink(x.link),
      photo: x.photo?.url ? { url: String(x.photo.url), path: String(x.photo.path || '') } : null,
      why: str(x.why, 200),
      when: isDate(x.when) ? x.when : '',
      createdAt: str(x.createdAt, 30),
      doneAt: isDate(x.doneAt) ? x.doneAt : '',
    };
  });
}

// 아직 못 이룬 것은 "언제쯤"이 가까운 순 → 날짜 없는 것(넣은 순), 이룬 것은 최근 순
export function dreamLists(list) {
  const all = normalizeDreams(list);
  const active = all.filter((x) => !x.doneAt).sort((a, b) => (a.when && b.when ? a.when.localeCompare(b.when) : a.when ? -1 : b.when ? 1 : 0));
  const done = all.filter((x) => x.doneAt).sort((a, b) => b.doneAt.localeCompare(a.doneAt));
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

export const fmtWon = (v) => `${Math.round(v).toLocaleString('ko-KR')}원`;
