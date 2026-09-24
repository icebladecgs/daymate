import { useEffect, useRef, useState } from "react";
import { googleSignInWithDriveScope } from "../firebase.js";
import { uploadFileToDrive, DRIVE_ATTACH_MAX_BYTES, DRIVE_ATTACH_FOLDER } from "../api/drive.js";
import { store } from "../utils/storage.js";

// 구글 드라이브 첨부 — 파일은 사용자 드라이브("DayMate 첨부파일" 폴더)에, 앱에는 {id,name,link,mimeType,size}만 저장.
// 목록에서 빼도 드라이브 파일은 지우지 않음 (사용자 결정: 실수 방지).

const validToken = () => {
  const t = store.get('dm_drive_token', null);
  const e = store.get('dm_drive_token_exp', 0);
  return t && Date.now() < e - 60 * 1000 ? t : null;
};

// 설정 화면의 드라이브 연결과 같은 토큰 저장소를 씀 → App이 이벤트를 받아 연결 상태를 갱신
const connectDrive = async () => {
  if (!window.google?.accounts?.oauth2) throw new Error('google_not_ready');
  const { accessToken, expiresAt } = await googleSignInWithDriveScope();
  store.set('dm_drive_token', accessToken);
  store.set('dm_drive_token_exp', expiresAt);
  window.dispatchEvent(new CustomEvent('dm-drive-token', { detail: { accessToken, expiresAt } }));
  return accessToken;
};

const fileIcon = (mimeType = '', name = '') => {
  const n = name.toLowerCase();
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf' || n.endsWith('.pdf')) return '📕';
  if (/sheet|excel|csv/.test(mimeType) || /\.(xlsx?|csv)$/.test(n)) return '📊';
  if (/presentation|powerpoint/.test(mimeType) || /\.pptx?$/.test(n)) return '📽️';
  if (/\.(hwp|hwpx)$/.test(n)) return '📘';
  if (/word|document|text/.test(mimeType) || /\.(docx?|txt)$/.test(n)) return '📄';
  if (/zip|compressed/.test(mimeType) || /\.(zip|7z|rar)$/.test(n)) return '🗜️';
  return '📎';
};

const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
};

// 파일 선택 → (필요하면 드라이브 연결) → 업로드. 버튼과 숨은 input을 함께 돌려줌
export function useDriveUpload({ files = [], onChange, onError }) {
  const inputRef = useRef(null);
  // 여러 파일을 차례로 올릴 때 직전 결과 위에 이어 붙이도록 최신 목록을 ref로 유지
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);
  const [status, setStatus] = useState(''); // '' | 'connecting' | '올리는 중 n%'

  const pick = async () => {
    if (status) return;
    if (validToken()) { inputRef.current?.click(); return; }
    // 연결 팝업은 사용자가 누른 직후에만 열 수 있어서, 연결 후에는 한 번 더 눌러 파일을 고르게 함
    setStatus('connecting');
    try {
      await connectDrive();
      onError?.('구글 드라이브 연결됐어요 ✅ 한 번 더 눌러 파일을 골라주세요');
    } catch {
      onError?.('구글 드라이브 연결에 실패했어요. 잠시 후 다시 시도해주세요');
    }
    setStatus('');
  };

  const handleFiles = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    const token = validToken();
    if (!token) { onError?.('드라이브 연결이 만료됐어요. 다시 눌러 연결해주세요'); return; }
    const tooBig = picked.filter(f => f.size > DRIVE_ATTACH_MAX_BYTES);
    if (tooBig.length) onError?.(`100MB가 넘는 파일은 올릴 수 없어요 (${tooBig.map(f => f.name).join(', ')})`);
    const targets = picked.filter(f => f.size <= DRIVE_ATTACH_MAX_BYTES);
    let added = 0;
    for (let i = 0; i < targets.length; i++) {
      const label = targets.length > 1 ? `(${i + 1}/${targets.length}) ` : '';
      setStatus(`${label}올리는 중 0%`);
      try {
        const uploaded = await uploadFileToDrive(token, targets[i], (p) => setStatus(`${label}올리는 중 ${Math.round(p * 100)}%`));
        const next = [...filesRef.current, uploaded];
        filesRef.current = next;
        onChange(next);
        added++;
      } catch (err) {
        console.error('[drive] upload failed:', err);
        if (err?.status === 401 || err?.status === 403) {
          store.remove('dm_drive_token');
          store.remove('dm_drive_token_exp');
          onError?.('드라이브 연결이 만료됐어요. 다시 눌러 연결해주세요');
          break;
        }
        onError?.(`"${targets[i].name}" 올리기 실패 — 통신 상태를 확인해주세요`);
      }
    }
    setStatus('');
    if (added) onError?.(`구글 드라이브 "${DRIVE_ATTACH_FOLDER}" 폴더에 저장했어요 ✅`);
  };

  // 사진 첨부 원칙과 동일하게 capture 속성 없음, 파일 종류 제한 없음
  const input = <input ref={inputRef} type="file" multiple onChange={handleFiles} style={{ display: 'none' }} />;
  const connected = !!validToken();
  const label = status === 'connecting' ? '연결 중...' : status || (connected ? '📁 구글 드라이브에 올리기' : '📁 구글 드라이브 연결');
  return { pick, input, label, busy: !!status };
}

// 메모에 붙여넣은 링크(모바일 청첩장, 드라이브 공유 링크 등)를 입력칸 아래에 누를 수 있게 보여줌
const URL_RE = /https?:\/\/[^\s<>"')]+/g;
export function MemoLinks({ text = '' }) {
  const urls = [...new Set(text.match(URL_RE) || [])].slice(0, 10);
  if (!urls.length) return null;
  const label = (u) => {
    try {
      const { hostname } = new URL(u);
      if (/drive\.google|docs\.google/.test(hostname)) return '구글 드라이브';
      return hostname.replace(/^www\./, '');
    } catch { return u; }
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -6, marginBottom: 14 }}>
      {urls.map(u => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, background: 'rgba(108,142,255,.12)', border: '1px solid rgba(108,142,255,.3)', color: '#6C8EFF', textDecoration: 'none', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          🔗 {label(u)}
        </a>
      ))}
    </div>
  );
}

// 첨부된 드라이브 파일 목록 — 누르면 드라이브에서 열기, ✕는 목록에서만 빼기
export function DriveFileList({ files = [], onChange }) {
  if (!files.length) return null;
  const remove = (id) => {
    if (!window.confirm('목록에서 뺄까요? 구글 드라이브의 파일은 그대로 남아요.')) return;
    onChange(files.filter(f => f.id !== id));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
      {files.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--dm-input)', border: '1px solid var(--dm-border)' }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{fileIcon(f.mimeType, f.name)}</span>
          <a href={f.link} target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, minWidth: 0, color: 'var(--dm-text)', fontSize: 13, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {f.name}
          </a>
          {f.size > 0 && <span style={{ fontSize: 11, color: 'var(--dm-muted)', flexShrink: 0 }}>{formatSize(f.size)}</span>}
          <button onClick={() => remove(f.id)} aria-label="목록에서 빼기"
            style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0 }}>✕</button>
        </div>
      ))}
    </div>
  );
}
