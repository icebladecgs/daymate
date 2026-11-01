// 사진 저장소(Storage) 규칙 (2026-11-01): 목록·남의 사진 직접 조회·덮어쓰기 차단.
// 화면은 다운로드 주소(보안 키 포함)로 보이므로 규칙과 무관 — 여기서는 앱이 SDK로 하는 요청만 본다(uploadPhoto·deletePhoto).
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  storage: { rules: readFileSync(new URL('../../../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
});
const results = [];
const t = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${String(e.message).split('\n')[0]}`); } };
const as = (uid) => env.authenticatedContext(uid).storage();
const anon = env.unauthenticatedContext().storage();
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
// uploadPhoto와 같은 모양
const meta = (uid) => ({ contentType: 'image/jpeg', customMetadata: { uid } });
const put = (st, path, uid, m = meta(uid)) => st.ref(path).put(jpg, m).then(() => {});

await env.clearStorage();
await env.withSecurityRulesDisabled(async (ctx) => {
  await ctx.storage().ref('users/victim/memos/card.jpg').put(jpg, meta('victim'));
  await ctx.storage().ref('community_photos/c1/chat_1.jpg').put(jpg, meta('victim'));
  await ctx.storage().ref('users/victim/memos/legacy.jpg').put(jpg, { contentType: 'image/jpeg' }); // 표시 없는 옛 사진
});

// ── 막혀야 할 것 ──
await t('차단: 로그인 없이 전체 목록', assertFails(anon.ref('').listAll()));
await t('차단: 로그인 없이 남의 메모 사진 목록', assertFails(anon.ref('users/victim/memos').listAll()));
await t('차단: 로그인해도 남의 메모 사진 목록', assertFails(as('attacker').ref('users/victim/memos').listAll()));
await t('차단: 내 폴더도 목록은 안 씀', assertFails(as('victim').ref('users/victim/memos').listAll()));
await t('차단: 로그인 없이 사진 주소 얻기', assertFails(anon.ref('users/victim/memos/card.jpg').getDownloadURL()));
await t('차단: 남의 사진 주소 얻기', assertFails(as('attacker').ref('users/victim/memos/card.jpg').getDownloadURL()));
await t('차단: 남의 사진 정보 읽기', assertFails(as('attacker').ref('community_photos/c1/chat_1.jpg').getMetadata()));
await t('차단: 남의 사진 덮어쓰기(내 표시를 붙여도)', assertFails(put(as('attacker'), 'users/victim/memos/card.jpg', 'attacker')));
await t('차단: 남의 커뮤니티 사진 덮어쓰기', assertFails(put(as('attacker'), 'community_photos/c1/chat_1.jpg', 'attacker')));
await t('차단: 남의 사진 지우기', assertFails(as('attacker').ref('users/victim/memos/card.jpg').delete()));
await t('차단: 남의 이름 표시로 올리기', assertFails(put(as('attacker'), 'users/attacker/memos/x.jpg', 'victim')));
await t('차단: 표시 없이 올리기', assertFails(put(as('attacker'), 'users/attacker/memos/y.jpg', null, { contentType: 'image/jpeg' })));
await t('차단: 사진 아닌 파일 올리기', assertFails(put(as('attacker'), 'users/attacker/memos/a.html', 'attacker', { contentType: 'text/html', customMetadata: { uid: 'attacker' } })));
await t('차단: 로그인 없이 올리기', assertFails(anon.ref('users/x/memos/z.jpg').put(jpg, meta('x'))));
await t('차단: 8MB 넘는 사진', assertFails(as('me').ref('users/me/memos/big.jpg').put(new Uint8Array(8 * 1024 * 1024 + 1), meta('me'))));

// ── 앱이 실제로 하는 요청 (허용) ──
await t('허용: 메모 사진 올리기(uploadPhoto)', assertSucceeds(put(as('me'), 'users/me/memos/1_a.jpg', 'me')));
await t('허용: 올린 직후 사진 주소 받기', assertSucceeds(as('me').ref('users/me/memos/1_a.jpg').getDownloadURL()));
await t('허용: 커뮤니티 채팅 사진 올리고 주소 받기', assertSucceeds((async () => {
  await put(as('me'), 'community_photos/c1/chat_2.jpg', 'me');
  await as('me').ref('community_photos/c1/chat_2.jpg').getDownloadURL();
})()));
// 화면 표시: 올린 사람이 받은 다운로드 주소는 로그인 없이(다른 사람 화면에서도) 열린다
await t('허용: 다운로드 주소로 남도 사진 보기(게시판·채팅 화면)', assertSucceeds((async () => {
  await put(as('me'), 'community_photos/c1/chat_3.jpg', 'me');
  const url = await as('me').ref('community_photos/c1/chat_3.jpg').getDownloadURL();
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
})()));
await t('허용: 내 사진 다시 올리기(같은 경로)', assertSucceeds(put(as('me'), 'users/me/memos/1_a.jpg', 'me')));
await t('허용: 내 사진 지우기(deletePhoto)', assertSucceeds(as('me').ref('users/me/memos/1_a.jpg').delete()));
await t('유지: 표시 없는 옛 사진은 앱에서 지울 수 없음(예전과 같음)', assertFails(as('victim').ref('users/victim/memos/legacy.jpg').delete()));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
