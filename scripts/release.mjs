// 배포를 명령 두 개로 — CLAUDE.md 3장 절차를 순서대로 실행한다. 맥·윈도우 공통.
//   npm run release:prepare  버전 갱신 → 빌드 → 기본 점검(+규칙이 바뀌었으면 규칙 테스트) → 버전 커밋 → push
//                            (작업 내용은 먼저 커밋해 둔다. 끝나면 사용자에게 보고하고 배포 승인을 받는다)
//   npm run release:deploy   (승인 뒤) 배포 전 확인 → vercel 프로덕션 배포 → 실제 반영 확인 → 배포 태그
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const SITE = 'https://daymate-beta.vercel.app';
const isWin = process.platform === 'win32';
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: isWin }).status ?? 1;
const die = (msg) => { console.error(`\n❌ ${msg}`); process.exit(1); };
const step = (msg) => console.log(`\n▶ ${msg}`);
const versionNow = () => readFileSync('src/version.js', 'utf8').match(/APP_VERSION = '([^']+)'/)?.[1];
const lastDeployTag = () => { try { return sh('git describe --tags --abbrev=0 --match "deploy-v*"'); } catch { return ''; } };
const VERSION_FILES = ['package.json', 'src/version.js', 'public/sw.js'];

function onMainAndSynced() {
  if (sh('git rev-parse --abbrev-ref HEAD') !== 'main') die('main 브랜치에서만 배포해요');
  sh('git fetch -q origin main');
  const [behind] = sh('git rev-list --left-right --count origin/main...HEAD').split(/\s+/).map(Number);
  if (behind > 0) die(`GitHub에 이 PC에 없는 커밋이 ${behind}개 있어요(맥에서 작업한 것일 수 있음). git pull 먼저`);
}

function prepare() {
  onMainAndSynced();
  // 앞 공백(' M')도 형식의 일부라 trim하지 않고 파일 이름만 뽑는다
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).filter(l => !VERSION_FILES.includes(l.slice(3)));
  if (dirty.length) die(`커밋 안 된 작업이 있어요. 작업 내용을 먼저 커밋하세요:\n${dirty.join('\n')}`);

  step('빌드 (버전 자동 갱신 포함)');
  if (run('npm', ['run', 'build']) !== 0) die('빌드 실패');

  step('기본 점검');
  if (run('npm', ['run', 'test:smoke']) !== 0) die('기본 점검 실패 — 배포하지 마세요');

  const tag = lastDeployTag();
  const rulesChanged = !tag || sh(`git diff --name-only ${tag} HEAD -- firestore.rules`);
  if (rulesChanged) {
    step('보안 규칙이 지난 배포 이후 바뀌어서 규칙 테스트');
    if (run('npm', ['run', 'test:rules']) !== 0) die('규칙 테스트 실패');
  }

  const v = versionNow();
  if (sh(`git status --porcelain -- ${VERSION_FILES.join(' ')}`)) {
    step(`버전 파일 커밋 (${v})`);
    sh(`git add ${VERSION_FILES.join(' ')}`);
    sh(`git commit -q -m "chore: 버전 갱신 ${v}"`);
  }
  step('GitHub에 올리기');
  if (run('git', ['push', '-q', 'origin', 'main']) !== 0) die('push 실패');

  console.log(`\n✅ 배포 준비 끝: ${v} (${sh('git rev-parse --short HEAD')})`);
  if (tag) console.log(`지난 배포(${tag}) 이후 바뀐 것:\n${sh(`git log ${tag}..HEAD --oneline --no-merges`)}`);
  if (rulesChanged) console.log('\n⚠️ 보안 규칙(firestore.rules)이 바뀌었어요 — 배포 전에 규칙 게시(npm run rules:deploy)가 필요해요 (사용자 승인 후)');
  console.log('\n다음: 사용자 승인 → npm run release:deploy');
}

function preflight() {
  step('배포 전 확인');
  onMainAndSynced();
  if (sh('git status --porcelain')) die('커밋 안 된 변경이 있어요 — 배포되는 코드와 커밋이 어긋나요');
  const [, ahead] = sh('git rev-list --left-right --count origin/main...HEAD').split(/\s+/).map(Number);
  if (ahead > 0) die('push 안 된 커밋이 있어요 — npm run release:prepare 먼저');
  const ignore = readFileSync('.vercelignore', 'utf8').split(/\r?\n/).map(s => s.trim());
  const missing = ['node_modules', 'desktop', '.git', 'dist'].filter(x => !ignore.includes(x));
  if (missing.length) die(`.vercelignore에 ${missing.join(', ')}가 없어요 (100MB 제한으로 배포 실패)`);
  const crons = JSON.parse(readFileSync('vercel.json', 'utf8')).crons || [];
  const bad = crons.filter(c => !/^\d+ \d+ \S+ \S+ \S+$/.test(c.schedule));
  if (bad.length) die(`하루 1회를 넘을 수 있는 cron이 있어요 (Hobby 요금제는 배포가 조용히 실패): ${bad.map(c => `${c.path} ${c.schedule}`).join(', ')}`);
  // Vercel Hobby는 서버 함수(api/*.js) 12개까지 — 넘으면 배포가 실패한다
  const fnCount = readdirSync('api').filter(f => /\.(js|mjs|ts)$/.test(f)).length;
  if (fnCount > 12) die(`api 폴더 서버 함수가 ${fnCount}개예요 (Hobby 요금제 최대 12개) — 새 파일 대신 기존 파일에 기능을 합치세요`);
  if (!existsSync('.env.local')) die('.env.local이 없어요 (VERCEL_TOKEN)');
  console.log(`  브랜치·커밋·.vercelignore·cron ${crons.length}개·서버 함수 ${fnCount}/12개 모두 정상`);
}

// .env.local 전체를 불러오지 않고 토큰 한 줄만 읽는다 (VERCEL_PROJECT_ID만 있으면 배포가 실패하기 때문)
function vercelToken() {
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find(l => /^\s*VERCEL_TOKEN\s*=/.test(l));
  const token = line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  if (!token) die('.env.local에 VERCEL_TOKEN이 없어요');
  return token;
}

async function verify(version, commit) {
  step('실제 반영 확인 (캐시 무시)');
  for (let i = 1; i <= 8; i++) {
    try {
      const q = `?v=${Date.now()}`;
      const sw = await (await fetch(`${SITE}/sw.js${q}`)).text();
      const html = await (await fetch(`${SITE}/${q}`)).text();
      const js = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
      const bundle = js ? await (await fetch(`${SITE}/${js}`)).text() : '';
      const swOk = sw.includes(`daymate-${commit}`);
      const verOk = bundle.includes(`"${version}"`);
      console.log(`  ${i}번째: 서비스워커 ${swOk ? '✅' : '…'} (daymate-${commit}) · 앱 버전 ${verOk ? '✅' : '…'} (${version})`);
      if (swOk && verOk) return true;
    } catch (e) { console.log(`  ${i}번째: 접속 실패 ${e.message}`); }
    await new Promise(r => setTimeout(r, 8000));
  }
  return false;
}

async function deploy() {
  preflight();
  const version = versionNow();
  const commit = sh('git rev-parse --short=7 HEAD');
  step(`Vercel 프로덕션 배포 (${version}, ${commit})`);
  const r = spawnSync('vercel', ['deploy', '--prod', '--yes', '--token', vercelToken()], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', shell: isWin });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const url = out.match(/https:\/\/[^\s]+\.vercel\.app/g)?.pop();
  if (r.status !== 0) die(`vercel 배포 실패:\n${out.split('\n').slice(-15).join('\n')}`);
  console.log(`  배포 주소: ${url || '(확인 못 함)'}`);
  if (!(await verify(version, commit))) die('배포 명령은 끝났지만 운영 주소에 새 버전이 보이지 않아요 — cron 제한·빌드 오류를 확인하세요 (배포 완료 아님)');
  step('배포 태그');
  if (run('npm', ['run', 'tag:deploy']) !== 0) die('태그 실패 (배포 자체는 됨)');
  console.log(`\n✅ 배포 완료: ${version} (${commit}) — ${SITE}`);
}

const cmd = process.argv[2];
if (cmd === 'prepare') prepare();
else if (cmd === 'deploy') await deploy();
else die('사용법: node scripts/release.mjs prepare | deploy');
