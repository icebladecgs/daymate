// 배틀 도트 장수의 갑옷 색 (PixelWarrior.jsx가 쓴다)

// 레벨 등급(브론즈·실버·골드·플래티넘·다이아몬드·챌린저)마다 갑옷 색·장식이 달라진다
export const ARMOR_TIERS = [
  { name: '브론즈',   H: '#3B2A20', A: '#B87333', a: '#7A4A22', B: '#4A3426', P: '#5B4636', K: '#2E2018', F: null,      C: null },
  { name: '실버',     H: '#9CA3AF', A: '#D1D5DB', a: '#8B929C', B: '#4B5563', P: '#4B5563', K: '#1F2937', F: null,      C: null },
  { name: '골드',     H: '#B8860B', A: '#F5C542', a: '#B8860B', B: '#7C2D12', P: '#7C2D12', K: '#3F1D0B', F: '#DC2626', C: null },
  { name: '플래티넘', H: '#0F766E', A: '#5EEAD4', a: '#0F9E8E', B: '#134E4A', P: '#134E4A', K: '#0B2E2B', F: '#F8FAFC', C: '#1D4ED8' },
  { name: '다이아몬드', H: '#1E40AF', A: '#93C5FD', a: '#3B82F6', B: '#1E3A8A', P: '#1E3A8A', K: '#0F172A', F: '#E0F2FE', C: '#7C3AED' },
  { name: '챌린저',   H: '#111827', A: '#FBBF24', a: '#92400E', B: '#111827', P: '#111827', K: '#000000', F: '#EF4444', C: '#B91C1C' },
];
// 상대(NPC)는 붉은 갑옷 한 벌
export const NPC_ARMOR = { H: '#1F1F1F', A: '#B91C1C', a: '#7F1D1D', B: '#292524', P: '#292524', K: '#0C0A09', F: '#FACC15', C: '#44403C' };

// 레벨(1~) → 등급 번호 — LEVEL_TITLES와 같은 4단계씩 (21 = 챌린저)
export const tierOfLevel = (level) => Math.min(5, Math.floor(Math.max(0, (level || 1) - 1) / 4));
