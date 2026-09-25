// 메모·일정(할일)에 첨부한 사진을 최신순으로 모은다. query가 있으면 그 글자가 들어간 메모·일정의 사진만.
export function collectPhotos(plans, query = "") {
  const q = query.trim().toLowerCase();
  const list = [];
  Object.entries(plans || {})
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([ds, d]) => {
      [...(d?.memos || [])].reverse().forEach(m => {
        if (!m.photos?.length) return;
        if (q && !(m.text || "").toLowerCase().includes(q)) return;
        m.photos.forEach((p, i) => p?.url && list.push({ key: `${ds}_m_${m.id}_${i}`, url: p.url, ds, kind: "memo", memo: m }));
      });
      (d?.tasks || []).forEach(t => {
        if (!t.photos?.length) return;
        if (q && !`${t.title || ""} ${t.note || ""}`.toLowerCase().includes(q)) return;
        t.photos.forEach((p, i) => p?.url && list.push({ key: `${ds}_t_${t.id}_${i}`, url: p.url, ds, kind: "task", task: t }));
      });
    });
  return list;
}
