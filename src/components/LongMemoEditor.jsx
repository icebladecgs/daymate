import { useEffect, useRef, useState } from "react";
import PhotoViewer from "./PhotoViewer.jsx";
import S from "../styles.js";
import { getMemoTimeStr } from "./MemoTimeline.jsx";
import { uploadPhoto, deletePhoto } from "../firebase.js";
import { PHOTO_MEMO_LABEL } from "../utils/dayMerge.js";
import { compressImage, photoErrorMessage } from "../utils/image.js";
import { useDriveUpload, DriveFileList, MemoLinks } from "./DriveFiles.jsx";
import { handleEditorKey } from "../utils/editorAssist.js";
import IndentBar from "./IndentBar.jsx";
import { requestMemoLock } from "../utils/memoLock.js";
import { pickTaskTitle, sendMemoToSomeday, sendMemoToToday, sentLabel } from "../utils/memoToTask.js";
import { toDateStr as todayYmd } from "../utils/date.js";
import LoginNotice from "./LoginNotice.jsx";
import { canAutoFocus } from "../utils/device.js";
import MemoSettings from "./MemoSettings.jsx";
import { newDesignOn } from "../utils/todayLook.js";
import { boxCard, UI } from "../styles.js";
import { store } from "../utils/storage.js";
import { useBackClose } from "../utils/useBackClose.js";
import { useAiTidy } from "./AiTidy.jsx";

// 새 디자인 머리글 아이콘 — 컬러 그림(🔒 주황·🔍 보라) 대신 다른 탭처럼 회색 선 아이콘 (2026-11-10 메모 탭 개선)
const HEAD_PATHS = {
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  newmemo: <><path d="M12 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-6" /><path d="M17 3v6M14 6h6" /></>,
};
const HeadIcon = ({ name, fill }) => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill={fill || "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{HEAD_PATHS[name]}</svg>
);
const headBtn = { background: 'none', border: 'none', color: 'var(--dm-sub)', cursor: 'pointer', width: 40, height: 40, padding: 0, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

function genPhotoPath(prefix) {
  return `${prefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
}

export default function LongMemoEditor({ tabScreen = false, hideBack = false, memoExists, initialId = null, initialText = '', subtitle = '', onCreate, onUpdate, onClose, onSearch, uid, pathPrefix, initialPhotos = [], onUpdatePhotos, onPhotoError, onRequireLogin, frequentTags = [], myTags = [], onHideTag, initialStarred = false, onUpdateStarred, initialFiles = [], onUpdateFiles, extraContent }) {
  const isNewEntry = initialId === null;
  const [text, setText] = useState(initialText);
  const [viewer, setViewer] = useState(null); // 사진 크게 보기 { photos, index }
  const [tagsOpen, setTagsOpen] = useState(() => store.get('dm_section_open_memo_tags', false) === true); // 메모 탭 쓰기 화면의 태그 접기 (기기마다)
  const [savedAt, setSavedAt] = useState(null);
  const [photos, setPhotos] = useState(initialPhotos);
  const [starred, setStarred] = useState(initialStarred);
  const [uploading, setUploading] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const idRef = useRef(initialId);
  const savedTextRef = useRef(initialText);
  const boxed = newDesignOn() && !!extraContent; // 메모 탭 쓰기 화면: 글쓰기·첨부와 태그를 둥근 칸으로 묶는다 (메모 열어 고치는 화면은 그대로)
  const [newLook] = useState(newDesignOn); // 새 디자인 — 버튼이 잘리지 않게 2줄, 흐린 태그·작은 글씨를 또렷하게
  const [sentTask, setSentTask] = useState(''); // 방금 언젠가로 보낸 제목 (버튼에 잠깐 표시)
  const [showSettings, setShowSettings] = useState(false);

  // 아직 저장 전(id 없음)인데 사진·파일을 먼저 추가하면, 지금까지 쓴 텍스트(없으면 플레이스홀더)로 즉시 메모를 생성
  const ensureId = (emptyLabel = PHOTO_MEMO_LABEL) => {
    if (idRef.current) return idRef.current;
    const placeholder = text.trim() || emptyLabel;
    idRef.current = onCreate(placeholder);
    savedTextRef.current = placeholder;
    setSavedAt(getMemoTimeStr());
    return idRef.current;
  };

  const commitPhotos = (next) => {
    const id = ensureId();
    setPhotos(next);
    onUpdatePhotos?.(id, next);
  };

  // 구글 드라이브 첨부 (파일은 사용자 드라이브에, 메모에는 이름·링크만)
  const [files, setFiles] = useState(initialFiles);
  const commitFiles = (next) => {
    const id = ensureId('📎 파일');
    setFiles(next);
    onUpdateFiles?.(id, next);
  };
  const drive = useDriveUpload({ files, onChange: commitFiles, onError: onPhotoError });

  const toggleStar = () => {
    const id = ensureId();
    const next = !starred;
    setStarred(next);
    onUpdateStarred?.(id, next);
  };

  const insertAtCursor = (insertText) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const needsSpaceBefore = before && !/\s$/.test(before);
    const insertion = (needsSpaceBefore ? ' ' : '') + insertText + ' ';
    const newText = before + insertion + after;
    setText(newText);
    const pos = (before + insertion).length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const handleInsertTag = (name) => insertAtCursor(`#${name}`);

  const handleAddTag = () => {
    setNewTagInput('');
    setAddingTag(true);
  };

  const confirmNewTag = () => {
    const name = newTagInput.trim();
    if (name) insertAtCursor(`#${name}`);
    setAddingTag(false);
    setNewTagInput('');
  };

  const handleAddPhoto = () => {
    if (uploading) return;
    if (!uid) { onRequireLogin?.(); return; }
    fileInputRef.current?.click();
  };

  const uploadAndAddPhoto = async (file) => {
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const path = genPhotoPath(pathPrefix);
      const result = await uploadPhoto(path, blob, uid);
      commitPhotos([...photos, result]);
    } catch (err) {
      onPhotoError?.(photoErrorMessage(err));
    }
    setUploading(false);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    uploadAndAddPhoto(file);
  };

  const handlePaste = (e) => {
    if (e.clipboardData?.getData('text/plain')?.trim()) return; // 엑셀·워드처럼 글자와 그림이 함께 복사되면 글자를 붙인다
    const item = Array.from(e.clipboardData?.items || []).find(it => it.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    if (uploading) return;
    if (!uid) { onRequireLogin?.(); return; }
    const file = item.getAsFile();
    if (file) uploadAndAddPhoto(file);
  };

  const handleRemovePhoto = (idx) => {
    if (!window.confirm('사진을 삭제할까요?')) return;
    const target = photos[idx];
    if (target?.path) deletePhoto(target.path);
    const next = photos.filter((_, i) => i !== idx);
    flush(text); // 쓰던 글을 먼저 저장 — 사진을 지운 메모가 빈 메모로 치워지지 않게
    commitPhotos(next);
    // 사진을 다 지운 자동 글자 메모는 저장 때 치워진다(stampMemoUpdates) — 이 화면은 새 메모로 이어 쓴다
    const typed = text.trim();
    if (!next.length && !files.length && savedTextRef.current === PHOTO_MEMO_LABEL && (!typed || typed === PHOTO_MEMO_LABEL)) {
      idRef.current = null;
      savedTextRef.current = '';
      setText('');
      setSavedAt('');
    }
  };

  useEffect(() => {
    if (!canAutoFocus()) return; // 휴대폰은 키보드가 버튼을 가려서 열 때 커서를 두지 않음
    const t = setTimeout(() => textareaRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const flush = (value) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === savedTextRef.current) return;
    if (idRef.current) onUpdate(idRef.current, trimmed);
    else idRef.current = onCreate(trimmed);
    savedTextRef.current = trimmed;
    setSavedAt(getMemoTimeStr());
  };

  // 자동 저장 debounce (1초)
  useEffect(() => {
    if (text.trim() === savedTextRef.current) return;
    const timer = setTimeout(() => flush(text), 1000);
    return () => clearTimeout(timer);
  }, [text]); // eslint-disable-line

  // 뒤로가기(화면 전환으로 언마운트)나 앱 종료 시 1초 debounce 대기 중인 내용이 취소되지 않도록 즉시 저장
  const latestRef = useRef({ text, flush });
  useEffect(() => { latestRef.current = { text, flush }; });
  useEffect(() => {
    const flushLatest = () => latestRef.current.flush(latestRef.current.text);
    const onHide = () => { if (document.visibilityState === 'hidden') flushLatest(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushLatest);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flushLatest);
      flushLatest();
    };
  }, []);

  // 쓰던 메모가 아래 목록에서 지워지면 입력칸을 새 메모로 — 그대로 두면 없는 메모에 저장돼 이어 쓴 글이 사라진다 (2026-11-06)
  // 아직 저장 안 된 글이 있으면 남겨서 새 메모로 저장한다
  const seenIdRef = useRef(null);
  useEffect(() => {
    const id = idRef.current;
    if (!memoExists || !id) return;
    if (memoExists(id)) { seenIdRef.current = id; return; }
    if (seenIdRef.current !== id) return; // 방금 만들어 아직 목록에 안 들어온 메모
    const unsaved = text.trim() !== savedTextRef.current;
    idRef.current = null;
    savedTextRef.current = '';
    setSavedAt('');
    setPhotos([]);
    setFiles([]);
    setStarred(false);
    if (!unsaved) setText('');
  });

  const handleClose = () => { flush(text); onClose(); };
  useBackClose(handleClose, !tabScreen); // 메모 탭의 쓰기 화면은 창이 아니라 탭이다

  const handleSaveAndContinue = () => {
    flush(text);
    setText('');
    setPhotos([]);
    setFiles([]);
    setStarred(false);
    idRef.current = null;
    savedTextRef.current = '';
    setSavedAt(null);
    onPhotoError?.('저장했어요 · 새 메모를 써 보세요');
    if (canAutoFocus()) requestAnimationFrame(() => textareaRef.current?.focus());
  };

  // 저장은 그 자리에 그대로 둔다 (2026-11-10 사용자 요청 — 예전엔 저장을 누르면 쓰던 메모가 사라지고 빈 화면이 됐다).
  // 새 메모는 머리글 "새 메모" 버튼(handleSaveAndContinue)으로
  const handleSaveClick = () => {
    if (!isNewEntry) { handleClose(); return; }
    if (!text.trim() && !idRef.current) { onPhotoError?.('저장할 내용이 없어요'); return; }
    flush(text);
    onPhotoError?.('저장됨 ✅');
  };
  const startNewMemo = () => {
    if (!text.trim() && !idRef.current && !photos.length && !files.length) { if (canAutoFocus()) textareaRef.current?.focus(); return; }
    handleSaveAndContinue();
  };
  // 📌 오늘로 / 📋 언젠가로 — 커서가 있는 줄(고른 글자가 있으면 그 부분)을 할일로. 메모 원본은 그대로
  const [sentToday, setSentToday] = useState('');
  const sendLine = (to) => {
    const el = textareaRef.current;
    const title = pickTaskTitle(text, el?.selectionStart ?? 0, el?.selectionEnd ?? 0);
    if (!title) { onPhotoError?.(`${to === 'today' ? '오늘' : '언젠가'}로 보낼 줄에 커서를 두거나 글자를 골라 주세요`); return; }
    if (to === 'today') {
      // 줄에 시간·날짜가 있으면 그대로 들어가고, 버튼에 "15:00 ✓"·"11/12 ✓"로 잠깐 보인다
      const sent = sendMemoToToday(title, ensureId());
      setSentToday(sentLabel(sent, todayYmd()));
      setTimeout(() => setSentToday(''), 2500);
    }
    else { sendMemoToSomeday(title, ensureId()); setSentTask(title); setTimeout(() => setSentTask(''), 2000); }
  };

  // 메모 잠금(암호화) — 저장하고 닫은 뒤 잠금 창을 띄운다
  const requestLock = () => {
    const id = idRef.current;
    if (!id || id === 'legacy') { onPhotoError?.('내용을 먼저 쓰고 저장한 뒤 잠가 주세요'); return; }
    handleClose();
    setTimeout(() => requestMemoLock(id, 'lock'), 50);
  };

  // ✨ AI 정리 (2026-11-10, components/AiTidy.jsx) — 바꾸면 쓰기 칸 글이 바뀌고 자동 저장이 그대로 올린다
  const tidy = useAiTidy({ getText: () => text, setText, notify: onPhotoError });

  // 🎤 말로 쓰기 (2026-11-10 — 메모 탭 아래 짧은 입력칸을 빼면서 음성 입력을 쓰기 칸으로 옮김). 알아들은 말은 글 끝에 붙인다
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  useEffect(() => () => recRef.current?.stop(), []);
  const toggleVoice = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { onPhotoError?.('이 브라우저는 음성 인식을 지원하지 않아요'); return; }
    const r = new SR();
    r.lang = 'ko-KR';
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      let said = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said += e.results[i][0].transcript;
      said = said.trim();
      if (said) setText(prev => (prev && !/\s$/.test(prev) ? `${prev} ` : prev) + said);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recRef.current = r;
    r.start();
    setListening(true);
  };

  const tagsAndPhotosBlock = (
    <div style={{ padding: boxed ? 0 : '0 20px 12px' }}>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      {viewer && <PhotoViewer photos={viewer.photos} index={viewer.index} onClose={() => setViewer(null)} />}
      <div style={{ paddingTop: 10 }}><MemoLinks text={text} /></div>

      {photos.map((p, idx) => (
        <div key={p.path || idx} style={{ position: 'relative', marginBottom: 12 }}>
          <img src={p.url} alt="첨부 사진" onClick={() => setViewer({ photos, index: idx })} style={{ width: '100%', borderRadius: 12, display: 'block', cursor: 'zoom-in' }} />
          <button
            onClick={() => handleRemovePhoto(idx)}
            aria-label="사진 삭제"
            style={{
              position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff',
              fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
          >✕</button>
        </div>
      ))}

      <DriveFileList files={files} onChange={commitFiles} />
      {drive.input}

      {/* 새 디자인 (2026-11-10): 사진·드라이브·언젠가로·말하기를 한 줄에 같은 모양으로 — 점선은 비활성처럼 보였다 */}
      {newLook && (() => {
        const tile = (active, color) => ({ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, minWidth: 0, minHeight: 58, padding: '6px 2px', borderRadius: 12,
          background: active ? `${color}1F` : 'var(--dm-input)', border: `1.5px solid ${active ? color : 'var(--dm-border)'}`, color: active ? color : 'var(--dm-sub)', fontSize: 13, fontWeight: 800,
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
        const ico = { fontSize: 20, lineHeight: 1 };
        return (<>
          {/* ✨ AI 정리 — 한 줄 전체 (2026-11-10) */}
          <button onClick={tidy.open} style={{ width: '100%', minHeight: 46, marginBottom: 8, borderRadius: 12, border: '1.5px solid rgba(139,92,246,.45)', background: 'rgba(139,92,246,.10)', color: '#8B5CF6', fontSize: 15, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>✨ AI로 정리하기</button>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${onUpdateFiles ? 5 : 4}, minmax(0,1fr))`, gap: 6, marginBottom: 14 }}>
            <button onClick={handleAddPhoto} disabled={uploading} style={tile(false)}>
              <span style={ico}>{uploading ? <span className="dm-spin" style={{ display: 'inline-block' }}>⏳</span> : '📷'}</span>사진
            </button>
            {onUpdateFiles && (
              <button onClick={drive.pick} disabled={drive.busy} style={tile(drive.busy, '#5B7CFA')}>
                <span style={ico}>📁</span>{drive.busy ? drive.label : '드라이브'}
              </button>
            )}
            {/* 📌 오늘로 (2026-11-10) · 📋 언젠가로 — 커서가 있는 줄(또는 고른 글자)을 할일로 */}
            <button onMouseDown={e => e.preventDefault()} title="커서가 있는 줄(또는 고른 글자)을 오늘 할일로 보내기"
              onClick={() => sendLine('today')} style={tile(!!sentToday, '#5B7CFA')}>
              <span style={ico}>📌</span>{sentToday || '오늘로'}
            </button>
            <button onMouseDown={e => e.preventDefault()} title="커서가 있는 줄(또는 고른 글자)을 언젠가할일로 보내기"
              onClick={() => sendLine('someday')} style={tile(!!sentTask, '#22C55E')}>
              <span style={ico}>📋</span>{sentTask ? '보냄 ✓' : '언젠가로'}
            </button>
            <button onClick={toggleVoice} aria-pressed={listening} style={tile(listening, '#EF4444')}>
              <span style={ico}>{listening ? '⏹' : '🎤'}</span>{listening ? '듣는 중' : '말하기'}
            </button>
          </div>
        </>);
      })()}
      {tidy.ui}
      {/* 사진 추가 옆에 구글 드라이브 첨부 버튼 */}
      {!newLook && <div style={newLook ? { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, marginBottom: 14 } : { display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          onClick={handleAddPhoto}
          disabled={uploading}
          style={{
            flex: 1, minWidth: 0, padding: '12px 6px', borderRadius: 12, background: 'var(--dm-input)',
            border: '1.5px dashed var(--dm-border)', color: newLook ? 'var(--dm-sub)' : 'var(--dm-muted)', fontSize: newLook ? 15 : 13, fontWeight: 700,
            cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >{uploading ? <span className="dm-spin" style={{ display: 'inline-block' }}>⏳</span> : '📷 사진 추가'}</button>
        {onUpdateFiles && (
          <button
            onClick={drive.pick}
            disabled={drive.busy}
            style={{
              flex: 1, minWidth: 0, padding: '12px 6px', borderRadius: 12, background: 'var(--dm-input)',
              border: '1.5px dashed var(--dm-border)', color: drive.busy ? 'var(--dm-accent, #6C8EFF)' : newLook ? 'var(--dm-sub)' : 'var(--dm-muted)', fontSize: newLook ? 15 : 13, fontWeight: 700,
              cursor: drive.busy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >{drive.busy ? drive.label : '📁 구글 드라이브'}</button>
        )}
        {/* 커서가 있는 줄(고른 글자가 있으면 그 부분)을 언젠가할일로 — 메모 원본은 그대로 */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            const el = textareaRef.current;
            const title = pickTaskTitle(text, el?.selectionStart ?? 0, el?.selectionEnd ?? 0);
            if (!title) { onPhotoError?.('언젠가로 보낼 줄에 커서를 두거나 글자를 골라 주세요'); return; }
            sendMemoToSomeday(title, ensureId());
            setSentTask(title);
            setTimeout(() => setSentTask(''), 2000);
          }}
          title="커서가 있는 줄(또는 고른 글자)을 언젠가할일로 보내기"
          style={{
            flex: '0 0 auto', gridColumn: newLook && onUpdateFiles ? '1 / -1' : undefined, padding: '12px 12px', borderRadius: 12, background: sentTask ? 'rgba(74,222,128,.12)' : 'var(--dm-input)',
            border: `1.5px dashed ${sentTask ? 'rgba(74,222,128,.5)' : 'var(--dm-border)'}`, color: sentTask ? '#4ADE80' : newLook ? 'var(--dm-sub)' : 'var(--dm-muted)', fontSize: newLook ? 15 : 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >{sentTask ? '보냄 ✓' : '📋 언젠가로'}</button>
        <button onMouseDown={e => e.preventDefault()} onClick={() => sendLine('today')} title="커서가 있는 줄(또는 고른 글자)을 오늘 할일로 보내기"
          style={{ flex: '0 0 auto', padding: '12px 12px', borderRadius: 12, background: sentToday ? 'rgba(91,124,250,.12)' : 'var(--dm-input)', border: `1.5px dashed ${sentToday ? 'rgba(91,124,250,.5)' : 'var(--dm-border)'}`, color: sentToday ? '#5B7CFA' : 'var(--dm-muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
        >{sentToday || '📌 오늘로'}</button>
        <button onClick={tidy.open} style={{ flex: '0 0 auto', padding: '12px 12px', borderRadius: 12, background: 'var(--dm-input)', border: '1.5px dashed rgba(139,92,246,.5)', color: '#8B5CF6', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>✨ AI 정리</button>
      </div>}

      {boxed && (
        <button className="dm-hit" onClick={() => setTagsOpen(v => { store.set('dm_section_open_memo_tags', !v); return !v; })} aria-expanded={tagsOpen}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, padding: '6px 0', marginBottom: tagsOpen ? 8 : 0, background: 'none', border: 'none', borderRadius: 0, fontSize: 15, fontWeight: 800, color: 'var(--dm-text)', cursor: 'pointer' }}>
          <span>🏷 태그</span><span style={{ fontSize: 14, color: 'var(--dm-muted)' }}>{tagsOpen ? '▲' : '▼'}</span>
        </button>
      )}
      {(!boxed || tagsOpen) && (<>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: newLook ? 14 : 10, color: newLook ? 'var(--dm-text)' : 'var(--dm-muted)', fontWeight: 900, marginBottom: 3 }}>내가 만든 태그</div>
        <div style={{ fontSize: newLook ? UI.sub : 10, color: 'var(--dm-muted)', marginBottom: newLook ? 8 : 5, opacity: 0.8 }}>'/'를 넣으면 하위 태그를 만들 수 있어요 (예: 만화/명대사)</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {myTags.map(name => (
            <div key={name} style={{ position: 'relative' }}>
              <button className={newLook ? 'dm-hit' : undefined}
                onClick={() => handleInsertTag(name)}
                style={{
                  background: 'rgba(167,139,250,0.13)', border: '1px solid rgba(167,139,250,0.3)',
                  borderRadius: 999, padding: newLook ? '7px 13px' : '5px 11px', fontSize: newLook ? 14 : 12, color: newLook ? '#8B5CF6' : '#c4b5fd',
                  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >#{name}</button>
              {onHideTag && (
                <button
                  onClick={() => onHideTag(name)}
                  aria-label="태그 목록에서 숨기기"
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff',
                    fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
                  }}
                >✕</button>
              )}
            </div>
          ))}
          {addingTag ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                autoFocus
                value={newTagInput}
                onChange={e => setNewTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmNewTag();
                  if (e.key === 'Escape') { setAddingTag(false); setNewTagInput(''); }
                }}
                placeholder="태그 이름"
                style={{
                  background: 'var(--dm-input)', border: '1px solid var(--dm-border)',
                  borderRadius: 999, padding: '5px 11px', fontSize: 12, color: 'var(--dm-text)',
                  fontFamily: 'inherit', width: 100,
                }}
              />
              <button
                onClick={confirmNewTag}
                style={{
                  background: 'var(--dm-accent-soft, rgba(108,142,255,0.2))', border: '1px solid var(--dm-accent-line, rgba(108,142,255,0.4))',
                  borderRadius: 999, padding: '5px 11px', fontSize: 12, color: '#b8c3ff',
                  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >추가</button>
            </div>
          ) : (
            <button className={newLook ? 'dm-hit' : undefined}
              onClick={handleAddTag}
              style={{
                background: 'var(--dm-input)', border: '1px dashed var(--dm-border)',
                borderRadius: 999, padding: newLook ? '7px 13px' : '5px 11px', fontSize: newLook ? 14 : 12, color: newLook ? 'var(--dm-sub)' : 'var(--dm-muted)',
                fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >+ 새 태그</button>
          )}
        </div>
      </div>
      {frequentTags.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: newLook ? 14 : 10, color: newLook ? 'var(--dm-text)' : 'var(--dm-muted)', fontWeight: 900, marginBottom: newLook ? 8 : 5 }}>많이 쓴 태그</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {frequentTags.map(name => (
              <button className={newLook ? 'dm-hit' : undefined}
                key={name}
                onClick={() => handleInsertTag(name)}
                style={{
                  background: 'var(--dm-accent-soft, rgba(108,142,255,0.13))', border: '1px solid var(--dm-accent-line, rgba(108,142,255,0.28))',
                  borderRadius: 999, padding: newLook ? '7px 13px' : '5px 11px', fontSize: newLook ? 14 : 12, color: newLook ? 'var(--dm-accent, #5B7CFA)' : '#b8c3ff',
                  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >#{name}</button>
            ))}
          </div>
        </div>
      )}
      </>)}
    </div>
  );

  const footerBlock = (
    <div style={{ padding: boxed ? '0 14px 12px' : '0 20px 20px', fontSize: newLook ? 13 : 11, color: 'var(--dm-muted)' }}>
      {text.length}자 · {savedAt ? `${savedAt} 자동저장됨` : '1초간 멈추면 자동저장돼요'}
    </div>
  );

  const textareaEl = (
    <textarea
      ref={textareaRef}
      value={text}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        // 편집 도우미: F12·Ctrl+/ 계산, Ctrl+; 날짜, Ctrl+D 줄 복제, 목록 이어쓰기 (utils/editorAssist.js)
        if (handleEditorKey(e, () => onPhotoError?.('계산할 수식이 없어요 (예: 1500000*12)'))) return;
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleClose();
      }}
      onPaste={handlePaste}
      placeholder="자유롭게 작성하세요"
      style={{ width: '100%', minHeight: boxed ? '28vh' : '35vh', background: boxed ? 'transparent' : 'var(--dm-bg)', border: 'none', outline: 'none', padding: boxed ? '14px' : '20px 20px', fontSize: 15, color: 'var(--dm-text)', lineHeight: 1.8, resize: 'none', fontFamily: 'inherit', wordBreak: 'break-word', overflowWrap: 'break-word', boxSizing: 'border-box', display: 'block' }}
    />
  );

  return (
    <div className="dm-memo-panel" style={S.fullScreenPanel(90)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: newLook ? 4 : 8, padding: newLook ? '12px 12px' : '12px 16px', borderBottom: '1px solid var(--dm-border)', flexShrink: 0 }}>
        {/* 새 디자인 메모 탭(탭 화면)에서는 ← 없음 — 탭인데 누르면 이전 화면으로 가서 헷갈렸다 (2026-11-10) */}
        {!hideBack && !(newLook && tabScreen) && <button className={newLook ? 'dm-hit' : undefined} aria-label="뒤로" onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>←</button>}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: newLook ? 17 : 15, fontWeight: 900, color: 'var(--dm-text)', whiteSpace: 'nowrap' }}>{extraContent ? '새 메모' : '긴 메모'}</div>
          {subtitle && <div style={{ fontSize: 12, color: "var(--dm-sub)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        {newLook ? (<>
          {/* 새 메모 (2026-11-10) — 쓰던 메모를 저장하고 빈 칸으로. 저장 버튼은 그 자리에 그대로 둔다 */}
          {isNewEntry && <button onClick={startNewMemo} aria-label="새 메모" title="새 메모 쓰기 (지금 메모는 저장돼요)" style={{ ...headBtn, color: 'var(--dm-accent, #5B7CFA)' }}><HeadIcon name="newmemo" /></button>}
          <button onClick={toggleStar} aria-label="즐겨찾기" style={{ ...headBtn, color: starred ? '#FBBF24' : headBtn.color }}><HeadIcon name="star" fill={starred ? '#FBBF24' : undefined} /></button>
          <button onClick={requestLock} aria-label="잠그기" title="메모 잠그기 (암호화)" style={headBtn}><HeadIcon name="lock" /></button>
          <button onClick={() => setShowSettings(true)} aria-label="메모 설정" title="메모 설정 (자동완성·단축키)" style={headBtn}><HeadIcon name="gear" /></button>
          {onSearch && <button onClick={onSearch} aria-label="검색" style={headBtn}><HeadIcon name="search" /></button>}
        </>) : (<>
        {isNewEntry && <button onClick={startNewMemo} aria-label="새 메모" title="새 메모 쓰기 (지금 메모는 저장돼요)" style={{ background: 'none', border: 'none', color: '#A78BFA', fontSize: 13, fontWeight: 900, cursor: 'pointer', padding: '4px 6px', lineHeight: 1, whiteSpace: 'nowrap' }}>＋새 메모</button>}
        <button onClick={toggleStar} aria-label="즐겨찾기" style={{ background: 'none', border: 'none', color: starred ? '#FBBF24' : 'var(--dm-muted)', fontSize: 18, cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}>{starred ? '★' : '☆'}</button>
        {/* 메모 잠금(암호화) — 저장하고 닫은 뒤 잠금 창을 띄운다 */}
        <button onClick={requestLock} aria-label="잠그기" title="메모 잠그기 (암호화)" style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 17, cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}>🔒</button>
        <button onClick={() => setShowSettings(true)} aria-label="메모 설정" title="메모 설정 (자동완성·단축키)" style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 17, cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}>⚙️</button>
        {onSearch && <button onClick={onSearch} aria-label="검색" style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 18, cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}>🔍</button>}
        </>)}
        <button
          onClick={handleSaveClick}
          // 새 디자인: 1초 뒤 자동 저장되므로 채운 버튼 대신 테두리만 (2026-11-07 — 저장을 꼭 눌러야 하는 것처럼 보였다)
          style={{ background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 10, padding: '8px 18px', fontSize: newLook ? 15 : 13, fontWeight: 900, color: newLook ? '#8B5CF6' : '#A78BFA', cursor: 'pointer', fontFamily: 'inherit', ...(newLook ? { height: UI.touch, whiteSpace: 'nowrap', flexShrink: 0, padding: '8px 14px', background: 'transparent', border: '1.5px solid var(--dm-border)', color: 'var(--dm-sub)', fontWeight: 800 } : {}) }}
        >저장</button>
      </div>
      {!uid && onRequireLogin && <LoginNotice onLogin={onRequireLogin} />}
      {extraContent ? (
        // extraContent가 있는 경우(메모 탭 전용): textarea/태그/사진/하단정보/추가콘텐츠를
        // 하나의 스크롤 영역으로 이어붙여서 쭉 내리면 아래 콘텐츠가 보이게 한다.
        // 기존 사용처(다른 화면들)는 extraContent를 넘기지 않으므로 이 분기를 타지 않고
        // 기존 레이아웃/스크롤 동작이 그대로 유지된다.
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {boxed ? (
            <>
              <div style={{ ...boxCard, marginTop: 12, padding: 0 }}>{textareaEl}{footerBlock}</div>
              <div style={boxCard}>{tagsAndPhotosBlock}</div>
            </>
          ) : (
            <>
              {textareaEl}
              {tagsAndPhotosBlock}
              {footerBlock}
            </>
          )}
          {extraContent}
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {textareaEl}
          </div>
          <div style={{ flexShrink: 0 }}>{tagsAndPhotosBlock}</div>
          <div style={{ flexShrink: 0 }}>{footerBlock}</div>
        </>
      )}
      <IndentBar taRef={textareaRef} />
      {showSettings && <MemoSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
