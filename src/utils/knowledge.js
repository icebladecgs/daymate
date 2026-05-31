const STOP_WORDS = new Set([
  '오늘','이번','그냥','정말','매우','너무','있다','없다','하다','되다',
  '이다','아니다','같다','보다','주다','받다','가다','오다','되어','해서',
  '그리고','하지만','그러나','그래서','때문에','이후','이전','처음','마지막',
  '매일','항상','자주','가끔','때로','여전히','이미','아직','더욱','조금',
  '모두','모든','각각','이것','저것','그것','여기','거기','저기','이때',
  '오전','오후','아침','점심','저녁','밤','새벽','시간','분','초',
  '이번주','다음주','저번주','이번달','다음달','내일','어제','지금','오늘도',
  '많이','적게','빨리','천천히','잘','못','안','그냥','약간','살짝',
  '하루','날','날짜','기록','생각','느낌','기분','이유','방법','결과',
  '사실','정도','경우','이후','동안','위해','통해','관해','대해','따라',
]);

// [[keyword]] 링크 파싱
export function parseWikiLinks(text) {
  if (!text) return [];
  const re = /\[\[([^\]]+)\]\]/g;
  const matches = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    const kw = m[1].trim();
    if (kw && kw.length >= 2) matches.add(kw);
  }
  return [...matches];
}

// 규칙 기반 키워드 추출 (한국어 명사형 + 영문 단어)
export function extractKeywords(text, maxCount = 6) {
  if (!text || text.length < 8) return [];
  const clean = text
    .replace(/\[\[[^\]]+\]\]/g, ' ')
    .replace(/[^가-힣a-zA-Z0-9\s]/g, ' ');
  const words = clean.match(/[가-힣]{2,6}|[A-Z][a-zA-Z0-9]{2,}|[a-z][a-zA-Z0-9]{3,}/g) || [];
  const freq = {};
  for (const w of words) {
    if (STOP_WORDS.has(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([w]) => w);
}

// plans 전체에서 키워드 인덱스 생성
// 반환: Map<keyword, [{dateStr, type, preview}]>
export function buildKeywordIndex(plans) {
  const index = new Map();

  const addEntry = (keyword, dateStr, type, preview) => {
    const kw = (keyword || '').trim();
    if (!kw || kw.length < 2) return;
    if (!index.has(kw)) index.set(kw, []);
    const list = index.get(kw);
    if (!list.find(e => e.dateStr === dateStr && e.type === type)) {
      list.push({ dateStr, type, preview: (preview || '').slice(0, 80) });
    }
  };

  Object.entries(plans || {}).forEach(([dateStr, day]) => {
    const sources = [
      { type: '메모', text: day.memo || '' },
      { type: '일기', text: day.journal?.body || '' },
    ];

    for (const { type, text } of sources) {
      if (!text.trim()) continue;
      const cleanPreview = text.replace(/\[\[([^\]]+)\]\]/g, '$1');
      parseWikiLinks(text).forEach(kw => addEntry(kw, dateStr, type, cleanPreview));
    }

    (day.tags || []).forEach(tag => {
      const preview = (day.memo || day.journal?.body || '').slice(0, 80);
      addEntry(tag, dateStr, '태그', preview.replace(/\[\[([^\]]+)\]\]/g, '$1'));
    });
  });

  return index;
}

// 자주 언급된 키워드 목록
export function getTopKeywords(plans, limit = 30) {
  const index = buildKeywordIndex(plans);
  return [...index.entries()]
    .map(([name, entries]) => {
      const sorted = [...entries].sort((a, b) => b.dateStr.localeCompare(a.dateStr));
      return { name, count: entries.length, lastDate: sorted[0]?.dateStr || '', entries: sorted };
    })
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit);
}

// 특정 키워드의 관련 기록
export function getKeywordRecords(plans, keyword) {
  const index = buildKeywordIndex(plans);
  return (index.get(keyword) || []).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
}

// 같은 날짜에 함께 등장한 관련 키워드
export function getRelatedKeywords(plans, keyword, limit = 8) {
  const targetRecords = getKeywordRecords(plans, keyword);
  const targetDates = new Set(targetRecords.map(r => r.dateStr));

  const index = buildKeywordIndex(plans);
  const related = new Map();

  index.forEach((entries, name) => {
    if (name === keyword) return;
    const overlap = entries.filter(e => targetDates.has(e.dateStr)).length;
    if (overlap > 0) related.set(name, overlap);
  });

  return [...related.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

// 텍스트를 [[keyword]] 기준으로 세그먼트 분리
export function parseContentToSegments(text) {
  if (!text) return [];
  return text.split(/(\[\[[^\]]+\]\])/g).map((part, i) => {
    const m = part.match(/^\[\[([^\]]+)\]\]$/);
    if (m) return { type: 'link', key: i, keyword: m[1].trim() };
    return { type: 'text', key: i, text: part };
  });
}
