// 데스크탑 앱 릴리스 한 번에 (2026-11-11 사용자 요청 — "태그에 버전 붙이기 귀찮다")
// 사용: npm run desktop:release   (desktop/package.json의 version을 먼저 올려 두고 커밋)
//  1. 설치 파일 빌드 (desktop에서 npm run build — 이미 최신이면 건너뜀)
//  2. 태그 Desktop-v{버전}을 자동으로 붙여 GitHub 릴리스 만들고 설치 파일(Daymate.Setup.{버전}.exe) 올리기
//  3. 받기 주소가 실제로 열리는지 확인
//  4. src/utils/desktopRelease.js의 DESKTOP_LATEST를 그 버전으로 바꿔 커밋·push (CLAUDE.md 15: 릴리스 먼저, 알림 값은 그다음)
// 끝나면 웹을 배포해야(release:prepare → 승인 → release:deploy) 데스크탑 앱에 새 버전 알림이 뜬다.
import { readFileSync, writeFileSync, existsSync, statSync, copyFileSync, mkdtempSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const desktop = path.join(root, 'desktop');
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: root, encoding: 'utf8', ...opts }).trim();
const stop = (msg) => { console.error(`\n❌ ${msg}`); process.exit(1); };
const step = (msg) => console.log(`\n▶ ${msg}`);

const version = JSON.parse(readFileSync(path.join(desktop, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version || '')) stop('desktop/package.json에서 버전을 찾지 못했어요');
const tag = `Desktop-v${version}`; // 대문자 D — 받기 주소와 대소문자까지 같아야 한다
const asset = `Daymate.Setup.${version}.exe`;
const built = path.join(desktop, 'dist', `Daymate Setup ${version}.exe`);
console.log(`데스크탑 ${version} 릴리스 (태그 ${tag})`);

// 준비 확인
if (sh('git status --porcelain')) stop('커밋 안 된 변경이 있어요. 릴리스할 코드를 먼저 커밋하세요');
if (sh('git rev-parse --abbrev-ref HEAD') !== 'main') stop('main 브랜치에서 하세요');
if (spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status !== 0) stop('GitHub 로그인이 필요해요: gh auth login');
const latestNow = readFileSync(path.join(root, 'src/utils/desktopRelease.js'), 'utf8').match(/DESKTOP_LATEST = '([^']+)'/)?.[1];
if (latestNow === version) stop(`앱의 최신 버전이 이미 ${version}이에요. desktop/package.json의 version을 올렸는지 확인하세요`);
if (spawnSync('gh', ['release', 'view', tag], { cwd: root, stdio: 'ignore' }).status === 0) stop(`${tag} 릴리스가 이미 있어요`);

step('GitHub에 올리기 (릴리스가 가리킬 커밋)');
sh('git push origin main', { stdio: 'inherit' });

// 1. 빌드 — 설치 파일이 desktop 코드보다 새것이면 건너뜀
const srcTime = Math.max(...['main.js', 'preload.js', 'package.json', 'settings.html'].map((f) => existsSync(path.join(desktop, f)) ? statSync(path.join(desktop, f)).mtimeMs : 0));
if (existsSync(built) && statSync(built).mtimeMs > srcTime) {
  step(`설치 파일이 이미 최신이라 빌드 건너뜀: ${path.relative(root, built)}`);
} else {
  step('설치 파일 빌드 (desktop → npm run build)');
  const r = spawnSync('npm', ['run', 'build'], { cwd: desktop, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0 || !existsSync(built)) stop('빌드에 실패했어요. 윈도우에서 winCodeSign 오류면 CLAUDE.md 15장 "데스크탑 설치 파일 배포"를 보세요');
}

// 2. 릴리스 — 파일 이름에 띄어쓰기가 있으면 GitHub가 점으로 바꾸니 처음부터 점 이름으로 올린다
step(`릴리스 ${tag} 만들고 ${asset} 올리기`);
const tmp = mkdtempSync(path.join(os.tmpdir(), 'dm-desk-'));
const upload = path.join(tmp, asset);
copyFileSync(built, upload);
const prevTag = sh('git tag -l "Desktop-v*" --sort=-v:refname').split(/\r?\n/).filter(Boolean)[0];
const changes = prevTag ? sh(`git log ${prevTag}..HEAD --pretty=format:"- %s" -- desktop`) : '';
const notesFile = path.join(tmp, 'notes.md');
writeFileSync(notesFile, `Daymate 데스크탑 ${version}\n\n설치: ${asset}를 받아 실행하면 기존 앱 위에 덮어 설치돼요. 설치 뒤 트레이의 DayMate를 완전히 종료했다가 다시 켜 주세요.\n\n${changes ? `바뀐 것 (${prevTag} 이후):\n${changes}\n` : ''}`);
const rel = spawnSync('gh', ['release', 'create', tag, upload, '--target', 'main', '--title', `Daymate Desktop ${version}`, '--notes-file', notesFile], { cwd: root, stdio: 'inherit' });
if (rel.status !== 0) stop('릴리스를 만들지 못했어요');
sh('git fetch --tags --quiet');

// 3. 받기 주소 확인
step('받기 주소 확인');
const url = `https://github.com/icebladecgs/daymate/releases/download/${tag}/${asset}`;
let ok = false;
for (let i = 0; i < 6 && !ok; i++) {
  try { const res = await fetch(url, { method: 'HEAD', redirect: 'follow' }); ok = res.ok; } catch { /* 다시 */ }
  if (!ok) await new Promise((r) => setTimeout(r, 3000));
}
if (!ok) stop(`받기 주소가 열리지 않아요: ${url}\n앱 알림 값은 바꾸지 않았어요. 릴리스 페이지를 확인하세요`);
console.log(`  ✅ ${url}`);

// 4. 앱의 새 버전 알림 값
step(`앱 새 버전 알림 값 → ${version}`);
const relFile = path.join(root, 'src/utils/desktopRelease.js');
writeFileSync(relFile, readFileSync(relFile, 'utf8').replace(/DESKTOP_LATEST = '[^']+'/, `DESKTOP_LATEST = '${version}'`));
sh('git add src/utils/desktopRelease.js');
sh(`git commit -q -m "chore: 데스크탑 최신 버전 ${version} (GitHub 릴리스 ${tag} 올라간 뒤)"`);
sh('git push origin main', { stdio: 'inherit' });

console.log(`\n✅ 데스크탑 ${version} 릴리스 끝 — ${url}`);
console.log('다음: 웹 배포(npm run release:prepare → 승인 → npm run release:deploy)를 해야 데스크탑 앱에 새 버전 알림이 떠요');
