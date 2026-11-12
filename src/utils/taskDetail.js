// 할일 ↔ 언젠가할일로 옮길 때 함께 가져가는 상세 정보 (할일 상세 창에서 편집하는 항목과 동일)
// 새 항목을 상세 창에 추가하면 여기에도 추가해야 이동 시 사라지지 않음
export const pickTaskDetail = (x = {}) => ({
  ...(x.note ? { note: x.note } : {}),
  ...(x.steps?.length ? { steps: x.steps } : {}), // 작은 단계 체크리스트 [{id, text, done}] (2026-11-03)
  ...(x.photos?.length ? { photos: x.photos } : {}),
  ...(x.files?.length ? { files: x.files } : {}),
  ...(x.time ? { time: x.time } : {}),
  ...(x.endTime ? { endTime: x.endTime } : {}), // 끝 시간 (2026-09-27)
  ...(x.focusMin ? { focusMin: x.focusMin } : {}), // 집중 타이머로 쌓인 시간(분)
  ...(x.statTag ? { statTag: x.statTag } : {}),
  ...(x.goalRef ? { goalRef: x.goalRef } : {}), // 🎯 어느 목표에서 파생됐는지
  ...(x.memoRef ? { memoRef: x.memoRef } : {}), // 📝 어느 메모에서 보냈는지 {ds, id} (2026-10-05)
  ...(x.cat ? { cat: x.cat } : {}), // 달력 보기 분류 — 직접 고른 것만 (utils/taskCategory.js, 2026-11-13)
});
