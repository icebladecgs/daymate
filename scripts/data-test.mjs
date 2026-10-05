// 기록 보존 점검 — 할일 이동·목표 편집·메모 휴지통·기기 간 병합에서 기록이 사라지지 않는지 본다.
//   npm run test:data   (release:prepare가 기본 점검 다음에 실행한다)
// 화면 없이 실제 앱 코드(src/utils)를 그대로 불러와 계산 결과만 확인한다. 서버·로그인 접속 없음.
// 기록이 사라졌던 실제 사고를 막는 테스트이므로, 실패하면 배포하지 않는다.
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const load = (p) => vite.ssrLoadModule(p);
const { pickTaskDetail } = await load('/src/utils/taskDetail.js');
const { matchGoalsByTitle } = await load('/src/utils/goals.js');
const { stampMemoUpdates, restoreMemoFromTrash, keepUnsyncedLocal, mergeImportedGcalTasks, restoreLostTaskDetails } = await load('/src/utils/dayMerge.js');

let pass = 0, fail = 0;
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 1. 할일 ↔ 언젠가 이동 시 상세 정보 유지 (CLAUDE.md 14.2) ──
{
  const full = {
    note: '메모', photos: [{ path: 'p1', url: 'u1' }], files: [{ id: 'f1', name: 'a.pdf' }],
    time: '09:00', endTime: '10:00', focusMin: 25, statTag: 'int', goalRef: { kind: 'year', title: '건강' }, memoRef: { ds: '2026-10-05', id: 'm1' },
  };
  const task = { id: 't1', title: '운동', done: false, ...full };
  const someday = { id: 'sd1', title: task.title, done: false, ...pickTaskDetail(task) }; // 할일 → 언젠가
  const back = { id: 't2', title: someday.title, done: false, ...pickTaskDetail(someday) }; // 언젠가 → 할일
  for (const k of Object.keys(full)) t(`할일→언젠가→할일: ${k} 유지`, same(back[k], full[k]), `${JSON.stringify(back[k])}`);
  t('빈 상세 정보는 빈 칸을 만들지 않음', same(pickTaskDetail({ id: 'x', title: 'y' }), {}));
}

// ── 2. 목표 제목을 고쳐도 실천 항목 유지 (CLAUDE.md 14.3) ──
{
  const old = ['건강', '독서', '저축'];
  const keep = (next) => {
    const m = matchGoalsByTitle(old, next);
    return next.map((title, i) => (m[i] >= 0 ? old[m[i]] : null));
  };
  t('제목 수정: 같은 자리 목표의 항목을 이어받음', same(keep(['건강', '책 50권', '저축']), ['건강', '독서', '저축']));
  t('순서 변경: 제목으로 찾아 이어받음', same(keep(['저축', '건강', '독서']), ['저축', '건강', '독서']));
  t('목표 추가: 새 목표는 빈 항목', same(keep(['건강', '독서', '저축', '여행']), ['건강', '독서', '저축', null]));
  t('목표 삭제: 남은 목표의 항목은 그대로', same(keep(['건강', '저축']), ['건강', '저축']));
}

// ── 3. 메모 삭제 → 휴지통 → 되살리기 (CLAUDE.md 15 메모 휴지통) ──
{
  const memo = { id: 'm1', text: '중요한 메모', createdAt: '09:00', updatedAt: '2026-10-01T00:00:00.000Z', photos: [{ path: 'p' }] };
  const prev = { memos: [memo, { id: 'm2', text: '다른 메모' }] };
  const deleted = stampMemoUpdates(prev, { ...prev, memos: [prev.memos[1]] });
  const inTrash = (deleted.memoTrash || []).find(m => m.id === 'm1');
  t('메모를 지우면 휴지통으로 이동', !!inTrash && !!inTrash.deletedAt);
  t('휴지통에서 글·사진 유지', inTrash?.text === memo.text && same(inTrash?.photos, memo.photos));
  t('빈 메모는 휴지통에 넣지 않음', !(stampMemoUpdates({ memos: [{ id: 'e', text: ' ' }] }, { memos: [] }).memoTrash || []).length);

  const restored = restoreMemoFromTrash(deleted, 'm1');
  const back = restored.memos.find(m => m.id === 'm1');
  t('되살리기: 메모 목록으로 돌아옴', !!back && back.text === memo.text && same(back.photos, memo.photos));
  t('되살리기: 휴지통에서 빠짐', !(restored.memoTrash || []).some(m => m.id === 'm1'));
  t('되살리기: 수정 시각 유지', back?.updatedAt === memo.updatedAt);
  const saved = stampMemoUpdates(deleted, restored); // 실제 저장 경로(setDayData)를 한 번 더 거침
  t('되살린 뒤 저장해도 다시 휴지통으로 가지 않음', saved.memos.some(m => m.id === 'm1') && !(saved.memoTrash || []).some(m => m.id === 'm1'));

  const old = { id: 'o', text: '옛 메모', deletedAt: new Date(Date.now() - 31 * 86400000).toISOString() };
  const purged = stampMemoUpdates({ memos: [{ id: 'k', text: 'a' }], memoTrash: [old] }, { memos: [], memoTrash: [old] });
  t('30일 지난 휴지통 메모는 비움', !purged.memoTrash.some(m => m.id === 'o'));
}

// ── 4. 다른 기기와 합칠 때 미동기화 기록 유지 (CLAUDE.md 15 날짜 기록 동기화) ──
{
  const now = Date.now();
  const remote = {
    tasks: [{ id: 't1', title: '서버 제목', note: '' }],
    memos: [{ id: 'm1', text: '서버 버전' }, { id: 'm3', text: '다른 기기에서 쓴 메모' }],
    journal: { body: '서버 일기' },
  };
  const local = {
    tasks: [{ id: 't1', title: '이 기기에서 고친 제목', note: '메모' }, { id: `t_${now}`, title: '방금 추가한 할일' }],
    memos: [{ id: 'm1', text: '이 기기에서 고친 버전' }, { id: 'm2', text: '포스트잇 새 메모' }],
    journal: { body: '이 기기 일기' },
  };
  // 미동기화 날짜: 로그인 병합과 같은 순서(mergeImportedGcalTasks → keepUnsyncedLocal)
  const merged = keepUnsyncedLocal(mergeImportedGcalTasks(remote, local, true), local);
  t('미동기화: 이 기기에서 고친 할일 유지', merged.tasks.find(x => x.id === 't1')?.title === '이 기기에서 고친 제목');
  t('미동기화: 방금 추가한 할일 유지', merged.tasks.some(x => x.title === '방금 추가한 할일'));
  t('미동기화: 이 기기에서 고친 메모 유지', merged.memos.find(m => m.id === 'm1')?.text === '이 기기에서 고친 버전');
  t('미동기화: 새 포스트잇 메모 유지', merged.memos.some(m => m.id === 'm2'));
  t('미동기화: 다른 기기에서 쓴 메모도 살림', merged.memos.some(m => m.id === 'm3'));
  t('미동기화: 이 기기 일기 유지', merged.journal?.body === '이 기기 일기');

  // 동기화된 날짜: 서버가 우선 — 이 기기의 옛 버전이 다른 기기 입력을 덮으면 안 됨
  const synced = mergeImportedGcalTasks(remote, local, false);
  t('동기화된 날짜: 다른 기기 입력(서버)이 우선', synced.tasks.find(x => x.id === 't1')?.title === '서버 제목');
  const oldLocal = { tasks: [{ id: 't_1600000000000', title: '오래된 로컬 할일' }] };
  t('동기화된 날짜: 다른 기기에서 지운 옛 할일은 되살리지 않음', !mergeImportedGcalTasks({ tasks: [] }, oldLocal, false).tasks.length);

  const lost = restoreLostTaskDetails({ tasks: [{ id: 't1', title: 'a', note: '' }] }, { tasks: [{ id: 't1', title: 'a', note: '사라질 뻔한 메모', photos: [{ path: 'p' }] }] });
  t('서버에서 빠진 할일 메모·사진 되살림', lost.tasks[0].note === '사라질 뻔한 메모' && lost.tasks[0].photos?.length === 1);
}

await vite.close();
console.log(`\n기록 보존 점검: ${pass}개 통과, ${fail}개 실패`);
process.exitCode = fail ? 1 : 0;
