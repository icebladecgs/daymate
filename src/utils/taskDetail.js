// 할일 ↔ 언젠가할일로 옮길 때 함께 가져가는 상세 정보 (할일 상세 창에서 편집하는 항목과 동일)
// 새 항목을 상세 창에 추가하면 여기에도 추가해야 이동 시 사라지지 않음
export const pickTaskDetail = (x = {}) => ({
  ...(x.note ? { note: x.note } : {}),
  ...(x.photos?.length ? { photos: x.photos } : {}),
  ...(x.files?.length ? { files: x.files } : {}),
  ...(x.time ? { time: x.time } : {}),
  ...(x.statTag ? { statTag: x.statTag } : {}),
  ...(x.goalRef ? { goalRef: x.goalRef } : {}), // 🎯 어느 목표에서 파생됐는지
});
