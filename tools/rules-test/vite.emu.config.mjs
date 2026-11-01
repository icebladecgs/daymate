// 테스트 전용 Vite 설정 (account-swap.mjs가 씀): 앱 코드는 그대로, firebase.js만 에뮬레이터에 붙이고 가짜 구글 로그인을 연다
// (CLAUDE.md 15 "로그인해야 보이는 화면을 테스트로 보기"). 이 폴더(tools)는 Vercel에 올라가지 않는다
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const { mergeConfig } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);
const { default: react } = await import(pathToFileURL(path.join(root, 'node_modules/@vitejs/plugin-react/dist/index.js')).href);
const base = { plugins: [react()] };

const emu = {
  name: 'dm-emulator',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replace(/\\/g, '/').endsWith('/src/firebase.js')) return null;
    return code + `
import { connectAuthEmulator as __cae, signInWithCredential as __siwc, GoogleAuthProvider as __gap } from "firebase/auth";
import { connectFirestoreEmulator as __cfe } from "firebase/firestore";
__cae(auth, "http://127.0.0.1:9099", { disableWarnings: true });
__cfe(db, "127.0.0.1", 8080);
window.__dmTestLogin = (sub, name) => __siwc(auth, __gap.credential(JSON.stringify({ sub, email: sub + "@test.com", email_verified: true, name })));
window.__dmTestLogout = () => auth.signOut();
`;
  },
};
const cfg = typeof base === 'function' ? base({ command: 'serve', mode: 'development' }) : base;
export default mergeConfig(cfg, { plugins: [emu], server: { port: 5199, strictPort: true }, root });
