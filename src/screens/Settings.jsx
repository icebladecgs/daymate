import { useEffect, useRef, useState } from "react";
import { toDateStr } from "../utils/date.js";
import { store } from "../utils/storage.js";
import { getPermission, requestPermission, sendNotification, playNotifSound, triggerVibration, speakTTS, SOUND_STYLES, TTS_DEFAULT_MESSAGES } from "../utils/notification.js";
import { parseLines, clampList } from "../utils/text.js";
import { ASSET_META, sendTelegramMessage, fetchMarketDataFromServer, buildBriefingText, searchFinnhub, searchKoreanStock, searchCoinGecko } from "../api/telegram.js";
import { saveSettings, saveGoals, recordInviteUse, getPendingSuggestionsCount, submitSuggestion } from "../firebase.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";
import { APP_VERSION, APP_BUILD } from "../version.js";

function MenuRow({ icon, title, sub, right, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '13px 16px', cursor: onClick ? 'pointer' : 'default',
      borderBottom: '1px solid var(--dm-row)',
      background: 'var(--dm-card)',
    }}>
      <span style={{ fontSize: 19, width: 26, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dm-text)' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginTop: 1 }}>{sub}</div>}
      </div>
      {right !== undefined ? right : (onClick && <span style={{ color: 'var(--dm-muted)', fontSize: 20, lineHeight: 1 }}>›</span>)}
    </div>
  );
}

function MenuGroup({ label, children }) {
  return (
    <>
      {label && <div style={S.sectionTitle}>{label}</div>}
      <div style={{ margin: '0 16px 6px', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--dm-border)' }}>
        {children}
      </div>
    </>
  );
}

function SubHeader({ title, onBack }) {
  return (
    <div style={{ ...S.topbar }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--dm-text)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}>←</button>
      <div style={{ flex: 1, fontSize: 18, fontWeight: 900, marginLeft: 8 }}>{title}</div>
    </div>
  );
}

function Toggle({ value, onChange, disabled }) {
  return (
    <div onClick={() => !disabled && onChange(!value)} style={{
      width: 52, height: 28, borderRadius: 999,
      background: value && !disabled ? '#6C8EFF' : 'var(--dm-border)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative', opacity: disabled ? 0.5 : 1, flexShrink: 0,
    }}>
      <div style={{ position: 'absolute', top: 4, left: value && !disabled ? 28 : 4, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
    </div>
  );
}

export default function Settings({ user, setUser, goals, setGoals, notifEnabled, setNotifEnabled,
  telegramCfg, setTelegramCfg, alarmTimes, setAlarmTimes, toast, setToast,
  authUser, syncStatus, onGoogleSignIn, onGoogleSignOut,
  habits, setHabits, recurringTasks, setRecurringTasks,
  installPrompt, handleInstall, setShowInstallBanner,
  gcalToken, gcalTokenExp, onGcalConnect, onGcalDisconnect, onGcalPull,
  isDark, setIsDark,
  event, setEvent, onAddInviteBonus,
  driveToken, driveTokenExp, onDriveConnect, onDriveBackup, lastDriveBackup,
  onOpenAdmin, onOpenStats, onOpenLifeCoach, onChangeScreen }) {

  const [subPage, setSubPage] = useState(null);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);
  useEffect(() => {
    if (authUser) getPendingSuggestionsCount().then(setPendingSuggestions).catch(() => {});
  }, [authUser]); // eslint-disable-line
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false);
  const [suggestionDone, setSuggestionDone] = useState(false);
  const maskEmail = (email) => {
    if (!email) return '익명';
    const [local, domain] = email.split('@');
    const masked = local.slice(0, 2) + '*'.repeat(Math.max(2, local.length - 2));
    return `${masked}@${domain}`;
  };
  const handleSubmitSuggestion = async () => {
    if (!suggestionText.trim()) return;
    setSubmittingSuggestion(true);
    try {
      await submitSuggestion(authUser.uid, maskEmail(authUser.email), suggestionText.trim());
      setSuggestionDone(true);
      setSuggestionText('');
    } catch (e) { console.error(e); }
    setSubmittingSuggestion(false);
  };
  const [menuSearch, setMenuSearch] = useState('');
  const [showAllMenu, setShowAllMenu] = useState(false);
  const [name, setName] = useState(user.name || "");
  const [yearText, setYearText] = useState((goals.year || []).join("\n"));
  const [birthDate, setBirthDate] = useState(() => store.get('dm_birth_date', ''));
  const [birthTime, setBirthTime] = useState(() => store.get('dm_birth_time', ''));
  const [permission, setPermission] = useState(getPermission());
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [gcalStatus, setGcalStatus] = useState('');
  const gcalConnected = !!(gcalToken && Date.now() < gcalTokenExp);
  const fileInputRef = useRef(null);

  // 초대 코드
  const [myCode] = useState(() => {
    const ex = store.get('dm_invite_code');
    if (ex) return ex;
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    store.set('dm_invite_code', code);
    return code;
  });
  const [codeInput, setCodeInput] = useState('');
  const [codeStatus, setCodeStatus] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  // 이벤트 배너
  const [eventName, setEventName] = useState(event?.name || '');
  const [eventStart, setEventStart] = useState(event?.startDate || '');
  const [eventEnd, setEventEnd] = useState(event?.endDate || '');
  const [eventActive, setEventActive] = useState(event?.active || false);
  const [showEventAdvanced, setShowEventAdvanced] = useState(false);

  // Drive
  const driveConnected = !!(driveToken && Date.now() < driveTokenExp);
  const [driveStatus, setDriveStatus] = useState('');

  const applyInviteCode = (code) => {
    if (code.length < 4) { setCodeStatus('코드가 너무 짧아요'); return false; }
    if (code === myCode) { setCodeStatus('내 코드는 사용할 수 없어요'); return false; }
    const used = store.get('dm_used_invite_codes', []);
    if (used.includes(code)) { setCodeStatus('이미 사용한 코드예요'); return false; }
    store.set('dm_used_invite_codes', [...used, code]);
    onAddInviteBonus?.(100);
    recordInviteUse(code).catch(() => {});
    setCodeStatus('✅ +100 XP 획득!');
    setCodeInput('');
    setTimeout(() => setCodeStatus(''), 4000);
    return true;
  };

  const useInviteCode = () => applyInviteCode(codeInput.trim().toUpperCase());

  // 링크로 접속 시 초대 코드 자동 적용
  useEffect(() => {
    const pending = store.get('dm_pending_invite');
    if (!pending) return;
    store.remove('dm_pending_invite');
    applyInviteCode(pending);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveEvent = () => {
    setEvent({ name: eventName, startDate: eventStart, endDate: eventEnd, active: eventActive });
    setToast('이벤트 저장 ✅');
  };

  const handleDriveConnect = async () => {
    setDriveStatus('연결 중...');
    const token = await onDriveConnect?.();
    if (token) {
      setDriveStatus('✓ Drive 연동 완료');
      onDriveBackup?.(token).then(() => setToast('Drive 백업 완료 ✅')).catch(() => {});
    } else {
      setDriveStatus('✗ 연동 실패');
    }
    setTimeout(() => setDriveStatus(''), 3000);
  };

  const [tgToken, setTgToken] = useState(telegramCfg.botToken || '');
  const [tgChatId, setTgChatId] = useState(telegramCfg.chatId || '');
  const [showBotHelp, setShowBotHelp] = useState(false);
  const [showChatHelp, setShowChatHelp] = useState(false);
  const [briefingTime, setBriefingTime] = useState(telegramCfg.briefingTime || '07:00');
  const [todoTime, setTodoTime] = useState(telegramCfg.todoTime || '07:05');
  const [selectedAssets, setSelectedAssets] = useState(
    telegramCfg.assets || Object.keys(ASSET_META)
  );
  const [customAssets, setCustomAssets] = useState(telegramCfg.customAssets || []);
  const [assetSearch, setAssetSearch] = useState('');
  const [searchMode, setSearchMode] = useState('stock');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [notifSound, setNotifSound] = useState(() => localStorage.getItem('dm_notif_sound') !== 'false');
  const [notifVibration, setNotifVibration] = useState(() => localStorage.getItem('dm_notif_vibration') !== 'false');
  const [soundStyle, setSoundStyle] = useState(() => localStorage.getItem('dm_notif_sound_style') || 'beep');
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('dm_notif_tts') === 'true');
  const [ttsMessages, setTtsMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dm_notif_tts_messages') || '{}'); } catch { return {}; }
  });
  const saveTtsMessages = (msgs) => { setTtsMessages(msgs); localStorage.setItem('dm_notif_tts_messages', JSON.stringify(msgs)); };
  const [morningTime, setMorningTime] = useState(alarmTimes.morning || '07:30');
  const [morningWorkTime, setMorningWorkTime] = useState(alarmTimes.morningWork || '09:00');
  const [noonTime, setNoonTime] = useState(alarmTimes.noon || '12:00');
  const [eveningTime, setEveningTime] = useState(alarmTimes.evening || '18:00');
  const [nightTime, setNightTime] = useState(alarmTimes.night || '23:00');

  const toggleAsset = (sym) => {
    setSelectedAssets(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
    );
  };

  const saveTelegram = () => {
    const cfg = {
      botToken: tgToken.trim(), chatId: tgChatId.trim(),
      briefingTime, todoTime, assets: selectedAssets, customAssets,
      weatherCity: telegramCfg.weatherCity || '',
    };
    setTelegramCfg(cfg);
    store.set('dm_telegram', cfg);
    if (authUser) saveSettings(authUser.uid, { telegram: cfg }).catch(() => {});
    setToast('텔레그램 설정 저장 ✅');
  };

  const searchTimerRef = useRef(null);
  const doAssetSearch = (query) => {
    setAssetSearch(query);
    if (!query.trim()) { setSearchResults([]); return; }
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      const results = searchMode === 'stock'
        ? await searchFinnhub('', query)
        : searchMode === 'korean'
          ? await searchKoreanStock(query)
          : await searchCoinGecko(query);
      setSearchResults(results);
      setSearching(false);
    }, 500);
  };

  const addCustomAsset = (asset) => {
    const allSyms = [...Object.keys(ASSET_META), ...customAssets.map(a => a.sym)];
    if (allSyms.includes(asset.sym)) { setToast(`${asset.sym} 이미 있어요`); return; }
    const next = [...customAssets, asset];
    setCustomAssets(next);
    setSelectedAssets(prev => [...prev, asset.sym]);
    setSearchResults([]);
    setAssetSearch('');
  };

  const removeCustomAsset = (sym) => {
    setCustomAssets(prev => prev.filter(a => a.sym !== sym));
    setSelectedAssets(prev => prev.filter(s => s !== sym));
  };

  const handleGcalConnect = async () => {
    setGcalStatus('연결 중...');
    const token = await onGcalConnect();
    setGcalStatus(token ? '✓ 연동 완료' : '✗ 연동 실패 (팝업 차단 확인)');
    setTimeout(() => setGcalStatus(''), 3000);
  };

  const handleGcalPull = async () => {
    setGcalStatus('가져오는 중...');
    try {
      const count = await onGcalPull(gcalToken);
      setGcalStatus(count > 0 ? `✓ ${count}개 가져왔어요` : '✓ 새 일정 없음');
    } catch {
      setGcalStatus('✗ 실패 (토큰 만료됐을 수 있어요)');
    }
    setTimeout(() => setGcalStatus(''), 3000);
  };

  const saveAlarmTimes = () => {
    const times = { morning: morningTime, morningWork: morningWorkTime, noon: noonTime, evening: eveningTime, night: nightTime };
    setAlarmTimes(times);
    store.set('dm_alarm_times', times);
    if (authUser) saveSettings(authUser.uid, { alarmTimes: times }).catch(() => {});
    setToast('알림 시간 저장 ✅');
  };

  const testTelegramMsg = async () => {
    const res = await sendTelegramMessage(tgToken.trim(), tgChatId.trim(), '✅ <b>DayMate 연결 테스트 성공!</b>\n\n텔레그램 알림이 정상 작동해요.');
    setToast(res.ok ? '텔레그램 전송 성공 ✅' : `전송 실패: ${res.error} 🚫`);
  };

  const testBriefing = async () => {
    setToast('브리핑 생성 중...');
    const customRegistry = Object.fromEntries(customAssets.map(a => [a.sym, a]));
    const marketData = await fetchMarketDataFromServer(selectedAssets, customRegistry);
    const text = buildBriefingText(marketData, user.name);
    const res = await sendTelegramMessage(tgToken.trim(), tgChatId.trim(), text);
    setToast(res.ok ? '브리핑 전송 성공 ✅' : `전송 실패: ${res.error} 🚫`);
  };

  const save = () => {
    const nextUser = { name: (name || "").trim() || "사용자" };
    const nextGoals = {
      year: clampList(parseLines(yearText), 5),
      month: goals.month || [],
    };
    setUser(nextUser);
    setGoals(nextGoals);
    store.set("dm_user", nextUser);
    store.set("dm_goals", nextGoals);
    store.set("dm_birth_date", birthDate);
    store.set("dm_birth_time", birthTime);
    if (authUser) saveSettings(authUser.uid, { name: nextUser.name }).catch(() => {});
    setToast("저장 완료 ✅");
  };

  const exportData = () => {
    const data = {};
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("dm_"))
        .forEach((k) => { data[k] = store.get(k); });
    } catch {}
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daymate-backup-${toDateStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("백업 파일 다운로드 ✅");
  };

  const importData = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        Object.keys(data || {}).forEach((k) => {
          if (k.startsWith("dm_")) store.set(k, data[k]);
        });
        alert("복구 완료! 앱을 새로고침하세요.");
      } catch {
        alert("파일 형식이 올바르지 않습니다.");
      }
    };
    reader.readAsText(file);
  };

  // ── 서브페이지: 프로필 ──────────────────────────────────────
  if (subPage === 'profile') return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      <SubHeader title="프로필 & 목표" onBack={() => setSubPage(null)} />

      <div style={S.sectionTitle}>이름</div>
      <div style={S.card}>
        <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        <button style={S.btn} onClick={save}>저장</button>
      </div>

      <div style={S.sectionTitle}>🔮 생년월일시 (운세용)</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 8 }}>
          오늘의 운세 · 사주 · 토정비결에 사용돼요
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>생년월일</div>
            <input style={{ ...S.input, marginBottom: 0 }} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>출생 시간 (선택)</div>
            <input style={{ ...S.input, marginBottom: 0 }} type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} placeholder="예: 14:30" />
          </div>
        </div>
        <button style={S.btn} onClick={save}>저장</button>
      </div>

      <div style={S.sectionTitle}>연간 목표</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 8 }}>
          👑 연간 목표 (최대 5개)
        </div>
        <textarea
          rows={5}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={yearText}
          onChange={(e) => setYearText(e.target.value)}
          placeholder="한 줄에 하나씩 입력"
        />
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 8, lineHeight: 1.6 }}>
          💡 이달 목표는 홈 화면에서 직접 추가/편집할 수 있어요
        </div>
        <button style={S.btn} onClick={save}>저장</button>
      </div>
      <div style={{ height: 12 }} />
    </div>
  );

  // ── 서브페이지: 알림 ──────────────────────────────────────
  if (subPage === 'notifications') return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      <SubHeader title="알림 설정" onBack={() => setSubPage(null)} />

      <div style={S.sectionTitle}>알림 ON/OFF</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900 }}>알림</div>
            {permission === "denied" && (
              <div style={{ fontSize: 12, color: "#F87171", marginTop: 6 }}>
                브라우저 알림이 차단되어 있어요. (사이트 설정에서 허용)
              </div>
            )}
            {permission === "default" && (
              <div style={{ fontSize: 12, color: "#FCD34D", marginTop: 6 }}>
                알림 권한을 먼저 허용해야 해요.
              </div>
            )}
            {permission === "unsupported" && (
              <div style={{ fontSize: 12, color: "#F87171", marginTop: 6 }}>
                이 브라우저는 알림을 지원하지 않아요.
              </div>
            )}
          </div>
          <div
            onClick={() => {
              if (permission !== "granted") return;
              const next = !notifEnabled;
              setNotifEnabled(next);
              store.set("dm_notif_enabled", next);
              setToast(next ? "알림 ON ✅" : "알림 OFF");
            }}
            style={{
              width: 52, height: 28, borderRadius: 999,
              background: notifEnabled && permission === "granted" ? "#6C8EFF" : "var(--dm-border)",
              cursor: permission === "granted" ? "pointer" : "not-allowed",
              position: "relative",
              opacity: permission === "granted" ? 1 : 0.5,
              flexShrink: 0,
            }}
          >
            <div style={{
              position: "absolute", top: 4,
              left: notifEnabled && permission === "granted" ? 28 : 4,
              width: 20, height: 20, borderRadius: "50%",
              background: "#fff", transition: "left .2s",
            }} />
          </div>
        </div>
        <button
          style={S.btnGhost}
          onClick={async () => {
            if (permission === "granted") {
              if (notifSound) playNotifSound();
              if (notifVibration) triggerVibration();
              sendNotification("DayMate Lite", "테스트 알림입니다. ✅", "🔔");
              setToast("테스트 알림 발송 ✅");
            } else if (permission === "denied") {
              setToast("알림이 차단됨 — 브라우저 설정 → 알림 → 허용으로 변경해주세요");
            } else {
              const r = await requestPermission();
              setPermission(r);
              if (r === "granted") {
                setNotifEnabled(true);
                sendNotification("DayMate Lite", "알림이 활성화됐어요! ✅", "🔔");
                setToast("알림 권한 허용됨 ✅");
              } else {
                setToast("알림 권한 거부됨 — 브라우저 설정에서 허용해주세요");
              }
            }
          }}
        >
          🔔 알림 권한 허용 / 테스트
        </button>
      </div>

      <div style={S.sectionTitle}>소리 / 진동</div>
      <div style={S.card}>
        {[
          { label: '알림 소리', sub: '알림 시 소리 재생', value: notifSound, onChange: (v) => { setNotifSound(v); localStorage.setItem('dm_notif_sound', v); if (v) playNotifSound(soundStyle); } },
          { label: '진동', sub: 'Android에서만 동작', value: notifVibration, onChange: (v) => { setNotifVibration(v); localStorage.setItem('dm_notif_vibration', v); if (v) triggerVibration(); } },
        ].map(({ label, sub, value, onChange }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 14 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 2 }}>{sub}</div>
            </div>
            <div onClick={() => onChange(!value)} style={{
              width: 52, height: 28, borderRadius: 999, flexShrink: 0, cursor: 'pointer',
              background: value ? '#6C8EFF' : 'var(--dm-border)', position: 'relative',
            }}>
              <div style={{ position: 'absolute', top: 4, left: value ? 28 : 4, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </div>
          </div>
        ))}
        {notifSound && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', fontWeight: 900, marginBottom: 8 }}>소리 스타일</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SOUND_STYLES.map(s => (
                <button key={s.id} onClick={() => { setSoundStyle(s.id); localStorage.setItem('dm_notif_sound_style', s.id); playNotifSound(s.id); }}
                  style={{
                    padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
                    borderColor: soundStyle === s.id ? '#6C8EFF' : 'var(--dm-border)',
                    background: soundStyle === s.id ? 'rgba(108,142,255,.15)' : 'var(--dm-input)',
                    color: soundStyle === s.id ? '#6C8EFF' : 'var(--dm-text)',
                    fontSize: 13, fontWeight: soundStyle === s.id ? 900 : 400, cursor: 'pointer',
                  }}>
                  {s.label}
                  <span style={{ fontSize: 10, color: 'var(--dm-muted)', marginLeft: 4 }}>{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={S.sectionTitle}>알림 시간 설정</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
          아침·점심·저녁·밤 알림 시간을 조정할 수 있어요.
        </div>
        {[
          { label: "아침 기상 알람", value: morningTime, set: setMorningTime },
          { label: "아침 할일 알람", value: morningWorkTime, set: setMorningWorkTime },
          { label: "점심 체크인", value: noonTime, set: setNoonTime },
          { label: "저녁 체크인", value: eveningTime, set: setEveningTime },
          { label: "밤 마감 알람", value: nightTime, set: setNightTime },
        ].map(({ label, value, set }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 13, color: "var(--dm-text)", fontWeight: 800 }}>{label}</div>
            <input
              type="time"
              value={value}
              onChange={(e) => set(e.target.value)}
              style={{ ...S.input, width: 110, padding: "8px 10px", marginBottom: 0 }}
            />
          </div>
        ))}
        <button style={S.btn} onClick={saveAlarmTimes}>알림 시간 저장</button>
      </div>

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>🗣</span> 음성 알람 (TTS)</div>
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14 }}>음성 알람</div>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 2 }}>알람 시 문구를 음성으로 읽어줘요</div>
          </div>
          <div onClick={() => { const v = !ttsEnabled; setTtsEnabled(v); localStorage.setItem('dm_notif_tts', v); if (v) speakTTS('음성 알람이 켜졌어요!'); }}
            style={{ width: 52, height: 28, borderRadius: 999, flexShrink: 0, cursor: 'pointer', background: ttsEnabled ? '#6C8EFF' : 'var(--dm-border)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 4, left: ttsEnabled ? 28 : 4, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
          </div>
        </div>
        {ttsEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'morning',     label: '🌅 기상 알람' },
              { key: 'morningWork', label: '☀️ 아침 할일 알람' },
              { key: 'noon',        label: '🕛 점심 체크인' },
              { key: 'evening',     label: '🌆 저녁 체크인' },
              { key: 'night',       label: '🌙 밤 마감 알람' },
            ].map(({ key, label }) => (
              <div key={key}>
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-sub)', marginBottom: 6 }}>{label}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 13 }}
                    value={ttsMessages[key] ?? TTS_DEFAULT_MESSAGES[key]}
                    onChange={e => saveTtsMessages({ ...ttsMessages, [key]: e.target.value })}
                    placeholder={TTS_DEFAULT_MESSAGES[key]}
                  />
                  <button onClick={() => speakTTS(ttsMessages[key] || TTS_DEFAULT_MESSAGES[key])}
                    style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 0, flexShrink: 0, fontSize: 18 }}>▶</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ height: 12 }} />
    </div>
  );

  // ── 서브페이지: 텔레그램 ──────────────────────────────────────
  if (subPage === 'telegram') return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      <SubHeader title="텔레그램 자동화" onBack={() => setSubPage(null)} />

      <div style={{ margin: '0 16px' }}>
        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900 }}>봇 토큰 (Bot Token)</div>
            <button onClick={() => setShowBotHelp(v => !v)}
              style={{ fontSize: 11, color: "#6C8EFF", background: "transparent", border: "none", cursor: "pointer", fontWeight: 700 }}>
              {showBotHelp ? "▲ 닫기" : "❓ 얻는 방법"}
            </button>
          </div>
          {showBotHelp && (
            <div style={{ fontSize: 12, color: "var(--dm-sub)", background: "var(--dm-deep)", borderRadius: 8, padding: "10px 12px", marginBottom: 10, lineHeight: 1.8, border: "1px solid var(--dm-border)" }}>
              <b style={{ color: "#6C8EFF" }}>1.</b> 텔레그램에서 <b>@BotFather</b> 검색 후 시작<br />
              <b style={{ color: "#6C8EFF" }}>2.</b> <code style={{ background: "var(--dm-input)", padding: "1px 5px", borderRadius: 4 }}>/newbot</code> 명령 입력<br />
              <b style={{ color: "#6C8EFF" }}>3.</b> 봇 이름 지정 → 사용자명(봇ID) 지정<br />
              <b style={{ color: "#6C8EFF" }}>4.</b> BotFather가 전송한 <b>HTTP API token</b> 복사<br />
              <span style={{ color: "var(--dm-muted)" }}>예) <code style={{ background: "var(--dm-input)", padding: "1px 5px", borderRadius: 4 }}>123456789:ABCdefGhIjklMno...</code></span>
            </div>
          )}
          <input style={S.input} value={tgToken} onChange={(e) => setTgToken(e.target.value)} placeholder="123456789:ABCdef..." type="password" />

          <div style={{ height: 10 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900 }}>채팅 ID (Chat ID)</div>
            <button onClick={() => setShowChatHelp(v => !v)}
              style={{ fontSize: 11, color: "#6C8EFF", background: "transparent", border: "none", cursor: "pointer", fontWeight: 700 }}>
              {showChatHelp ? "▲ 닫기" : "❓ 얻는 방법"}
            </button>
          </div>
          {showChatHelp && (
            <div style={{ fontSize: 12, color: "var(--dm-sub)", background: "var(--dm-deep)", borderRadius: 8, padding: "10px 12px", marginBottom: 10, lineHeight: 1.8, border: "1px solid var(--dm-border)" }}>
              <b style={{ color: "#6C8EFF" }}>1.</b> 텔레그램에서 내가 만든 봇을 찾아 메시지 전송<br />
              <b style={{ color: "#6C8EFF" }}>2.</b> 브라우저에서 아래 URL 접속:<br />
              <code style={{ background: "var(--dm-input)", padding: "2px 6px", borderRadius: 4, wordBreak: "break-all" }}>https://api.telegram.org/bot<b>토큰</b>/getUpdates</code><br />
              <b style={{ color: "#6C8EFF" }}>3.</b> 결과 JSON에서 <code style={{ background: "var(--dm-input)", padding: "1px 5px", borderRadius: 4 }}>"chat":{"{\"id\": "}<b>숫자</b>{"}"}</code> 확인<br />
              <span style={{ color: "var(--dm-muted)" }}>또는 <b>@userinfobot</b>에 메시지 보내면 ID 알려줌</span>
            </div>
          )}
          <input style={S.input} value={tgChatId} onChange={(e) => setTgChatId(e.target.value)} placeholder="123456789" />

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 4 }}>
            Finnhub API Key <span style={{ color: "var(--dm-muted)", fontWeight: 400 }}>(Vercel 환경변수로 설정)</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--dm-muted)", padding: "10px 12px", background: "var(--dm-deep)", borderRadius: 8, border: "1px solid var(--dm-border)" }}>
            🔒 FINNHUB_KEY 서버 환경변수로 관리됨 — 입력할 필요 없음
          </div>

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 4 }}>날씨 도시</div>
          <input style={S.input} value={telegramCfg.weatherCity || ''}
            onChange={(e) => setTelegramCfg(prev => ({...prev, weatherCity: e.target.value}))}
            placeholder="서울 (기본값)" />

          <div style={{ height: 14 }} />
          <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 10 }}>알림 시간</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>자산 브리핑</div>
              <input style={S.input} type="time" value={briefingTime} onChange={(e) => setBriefingTime(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>할일 알림</div>
              <input style={S.input} type="time" value={todoTime} onChange={(e) => setTodoTime(e.target.value)} />
            </div>
          </div>

          <div style={{ height: 14 }} />
          <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 10 }}>브리핑 자산 선택</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(ASSET_META).map(([sym, meta]) => {
              const on = selectedAssets.includes(sym);
              return (
                <button
                  key={sym}
                  onClick={() => toggleAsset(sym)}
                  style={{
                    padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                    background: on ? "#4B6FFF" : "var(--dm-row)",
                    color: on ? "#fff" : "var(--dm-muted)",
                  }}
                >
                  {sym} <span style={{ fontWeight: 400 }}>{meta.label}</span>
                </button>
              );
            })}
          </div>

          {customAssets.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {customAssets.map(a => (
                <div key={a.sym} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: selectedAssets.includes(a.sym) ? "#4B6FFF" : "var(--dm-row)",
                  color: selectedAssets.includes(a.sym) ? "#fff" : "var(--dm-muted)",
                }}>
                  <span onClick={() => toggleAsset(a.sym)} style={{ cursor: "pointer" }}>
                    {a.sym} <span style={{ fontWeight: 400 }}>{a.label}</span>
                  </span>
                  <span
                    onClick={() => removeCustomAsset(a.sym)}
                    style={{ cursor: "pointer", color: "#F87171", fontWeight: 900, marginLeft: 2 }}
                  >×</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 8 }}>자산 검색 추가</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[
                { id: 'stock', label: '해외주식/ETF' },
                { id: 'korean', label: '국내주식' },
                { id: 'crypto', label: '코인' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => { setSearchMode(id); setSearchResults([]); setAssetSearch(''); }}
                  style={{
                    padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                    background: searchMode === id ? "#4B6FFF" : "var(--dm-row)",
                    color: searchMode === id ? "#fff" : "var(--dm-muted)",
                  }}
                >{label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...S.input, flex: 1, marginBottom: 0 }}
                placeholder={searchMode === 'stock' ? 'AAPL, NVDA, SPY...' : searchMode === 'korean' ? '삼성전자, 카카오...' : 'SOL, XRP, DOGE...'}
                value={assetSearch}
                onChange={e => doAssetSearch(e.target.value)}
              />
              {searching && <span style={{ color: "var(--dm-sub)", fontSize: 12, alignSelf: "center" }}>검색 중...</span>}
            </div>
            {searchResults.length > 0 && (
              <div style={{
                marginTop: 8, background: "var(--dm-deep)", border: "1px solid var(--dm-border)",
                borderRadius: 10, overflow: "hidden",
              }}>
                {searchResults.map(item => (
                  <div
                    key={item.sym + item.src}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px", borderBottom: "1px solid var(--dm-card)", cursor: "pointer",
                    }}
                    onClick={() => addCustomAsset(item)}
                  >
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "var(--dm-text)" }}>{item.sym}</span>
                      <span style={{ fontSize: 12, color: "var(--dm-sub)", marginLeft: 8 }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: 12, color: "#4B6FFF", fontWeight: 700 }}>+ 추가</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ height: 14 }} />
          <button style={S.btn} onClick={saveTelegram}>저장</button>
          <button style={S.btnGhost} onClick={testTelegramMsg}>연결 테스트</button>
          <button style={S.btnGhost} onClick={testBriefing}>자산 브리핑 테스트 전송</button>
          <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 10, lineHeight: 1.7 }}>
            ⚠️ 탭이 열려 있을 때만 동작해요.
          </div>
        </div>
      </div>
      <div style={{ height: 12 }} />
    </div>
  );

  // ── 서브페이지: Google 연동 ──────────────────────────────────────
  if (subPage === 'integrations') return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      <SubHeader title="Google 연동" onBack={() => setSubPage(null)} />

      <div style={S.sectionTitle}>계정 동기화</div>
      <div style={S.card}>
        {authUser ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              {authUser.photoURL && (
                <img src={authUser.photoURL} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} />
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{authUser.displayName}</div>
                <div style={{ fontSize: 12, color: "var(--dm-sub)" }}>{authUser.email}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: syncStatus === 'synced' ? '#4ade80' : 'var(--dm-sub)', marginBottom: 12 }}>
              {syncStatus === 'syncing' ? '동기화 중...' : syncStatus === 'synced' ? '✓ 동기화 완료' : '대기 중'}
            </div>
            <button style={S.btnGhost} onClick={() => {
              if (window.confirm('로그아웃하시겠습니까?\n로그아웃해도 기기의 데이터는 유지돼요.')) onGoogleSignOut().catch(() => {});
            }}>로그아웃</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
              Google 계정으로 로그인하면 데스크탑↔모바일 데이터가 자동으로 동기화돼요.
            </div>
            <button
              style={{ ...S.btn, background: "#fff", color: "#333", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              onClick={() => onGoogleSignIn().catch(() => {})}
            >
              <span style={{ fontSize: 16 }}>G</span> Google로 로그인
            </button>
          </div>
        )}
      </div>

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>🗓️</span> 구글 캘린더</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: 'var(--dm-sub)', lineHeight: 1.7, marginBottom: 12 }}>
          {gcalConnected
            ? `연동됨 · ${new Date(gcalTokenExp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 까지 유효`
            : '할일을 구글 캘린더에 자동으로 추가하거나, 캘린더 일정을 오늘 할일로 가져올 수 있어요.'}
        </div>
        {gcalConnected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={handleGcalPull} style={{ ...S.btnGhost, marginTop: 0, fontSize: 13 }}>
              📥 오늘 일정 가져오기
            </button>
            <button onClick={() => {
              if (window.confirm('구글 캘린더 연동을 정말로 해제하시겠습니까?')) onGcalDisconnect();
            }} style={{
              ...S.btnGhost, marginTop: 0, fontSize: 13,
              color: '#F87171', border: '1.5px solid rgba(248,113,113,.35)',
            }}>
              🔓 연동 해제
            </button>
          </div>
        ) : (
          <button onClick={handleGcalConnect} style={S.btn}>🔗 구글 캘린더 연동하기</button>
        )}
        {gcalStatus && (
          <div style={{
            fontSize: 12, marginTop: 10, fontWeight: 700,
            color: gcalStatus.startsWith('✓') ? '#4ADE80' : gcalStatus.includes('중') ? 'var(--dm-sub)' : '#F87171',
          }}>
            {gcalStatus}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 10, lineHeight: 1.8 }}>
          💡 연동 버튼을 누르면 구글 계정 선택 팝업이 열려요.<br/>
          ⚠️ "앱을 확인할 수 없습니다" 경고창이 뜨면 <b>고급 → 계속</b>을 눌러주세요.<br/>
          🕐 연동은 1시간 유효해요. 만료되면 버튼이 다시 "연동하기"로 바뀌며, 재연동하면 돼요.
        </div>
      </div>

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>☁️</span> 구글 드라이브</div>
      <div style={S.card}>
        {lastDriveBackup && (
          <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 8 }}>
            마지막 백업: {new Date(lastDriveBackup).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        {driveConnected ? (
          <button onClick={async () => {
            setDriveStatus('백업 중...');
            try { await onDriveBackup?.(driveToken); setToast('Drive 백업 완료 ✅'); setDriveStatus(''); }
            catch (e) { setToast('Drive 백업 실패 ❌'); setDriveStatus('✗ 백업 실패'); setTimeout(() => setDriveStatus(''), 3000); }
          }} style={{ ...S.btnGhost, marginTop: 0, fontSize: 13 }}>
            ☁️ 지금 백업하기
          </button>
        ) : (
          <button onClick={handleDriveConnect} style={{ ...S.btn, marginTop: 0, fontSize: 13 }}>
            🔗 구글 드라이브 연동
          </button>
        )}
        {driveStatus && (
          <div style={{ fontSize: 12, marginTop: 8, fontWeight: 700, color: driveStatus.startsWith('✓') ? '#4ADE80' : driveStatus.includes('중') ? 'var(--dm-sub)' : '#F87171' }}>
            {driveStatus}
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 8, lineHeight: 1.7 }}>
          💡 연동하면 매일 자동으로 구글 드라이브에 백업돼요.<br/>
          ⚠️ 1시간마다 재연동이 필요해요.
        </div>
      </div>
      <div style={{ height: 12 }} />
    </div>
  );

  // ── 서브페이지: 친구 & 공유 ──────────────────────────────────────
  if (subPage === 'friends') return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      <SubHeader title="친구 & 공유" onBack={() => setSubPage(null)} />

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>🎁</span> 친구 초대</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
          내 코드/링크로 친구가 가입하면 <b style={{ color: "#6C8EFF" }}>친구가 +100 XP</b> 획득, 나는 초대 랭킹이 올라가요!
        </div>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 900, marginBottom: 6 }}>내 초대 코드</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, padding: "12px 14px", borderRadius: 12, background: "var(--dm-deep)", border: "1.5px solid var(--dm-border)", fontSize: 20, fontWeight: 900, letterSpacing: 4, textAlign: "center", color: "#6C8EFF" }}>
            {myCode}
          </div>
          <button onClick={() => {
            const txt = `DayMate 초대 코드: ${myCode}\n👉 https://daymate-beta.vercel.app?invite=${myCode}`;
            navigator.clipboard?.writeText(txt).then(() => { setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); });
          }} style={{ ...S.btn, width: 64, marginTop: 0, flexShrink: 0 }}>
            {codeCopied ? '✓' : '복사'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 900, marginBottom: 4 }}>친구 코드 입력</div>
        <div style={{ fontSize: 11, color: "var(--dm-sub)", marginBottom: 8, lineHeight: 1.5 }}>친구에게 코드를 직접 받았다면 여기 입력 → <b style={{ color: "#4ADE80" }}>내가 +100 XP</b> 획득!</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...S.input, flex: 1, marginBottom: 0, letterSpacing: 2, textTransform: "uppercase" }}
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && useInviteCode()}
            placeholder="XXXXXX"
            maxLength={8}
          />
          <button onClick={useInviteCode} style={{ ...S.btn, width: 64, marginTop: 0, flexShrink: 0 }}>사용</button>
        </div>
        {codeStatus && (
          <div style={{ fontSize: 13, marginTop: 10, fontWeight: 900, color: codeStatus.startsWith('✅') ? '#4ADE80' : '#F87171' }}>{codeStatus}</div>
        )}
      </div>

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>🔗</span> 친구에게 공유하기</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
          링크로 접속하면 내 초대 코드가 자동 적용돼요. 친구가 +100 XP를 받고, 나는 초대 랭킹이 올라가요! 🎉
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {navigator.share && (
            <button onClick={async () => {
              try { await navigator.share({ title: 'DayMate', text: '📅 DayMate — 매일 할일 3가지, 습관, 일기를 한 곳에서! 무료로 써보세요 👉 ', url: `https://daymate-beta.vercel.app?invite=${myCode}` }); } catch {}
            }} style={{ ...S.btn, marginTop: 0, background: 'linear-gradient(135deg,#FEE500,#FDD835)', color: '#3C1E1E' }}>
              💬 카카오 / 문자로 공유하기
            </button>
          )}
          <button onClick={() => {
            const full = `📅 DayMate — 매일 할일 3가지, 습관, 일기를 한 곳에서! 무료로 써보세요 👉 https://daymate-beta.vercel.app?invite=${myCode}`;
            if (navigator.clipboard) {
              navigator.clipboard.writeText(full).then(() => { setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); });
            } else {
              const ta = document.createElement('textarea');
              ta.value = full; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
              setShareCopied(true); setTimeout(() => setShareCopied(false), 2000);
            }
          }} style={{
            ...S.btn, marginTop: 0,
            background: shareCopied ? 'rgba(74,222,128,.15)' : 'var(--dm-input)',
            color: shareCopied ? '#4ADE80' : 'var(--dm-text)',
            border: '1.5px solid var(--dm-border)', boxShadow: 'none',
          }}>
            {shareCopied ? '✓ 링크 복사됨' : '🔗 링크 복사하기'}
          </button>
        </div>
      </div>
      <div style={{ height: 12 }} />
    </div>
  );

  // ── 서브페이지: 앱 관리 ──────────────────────────────────────
  if (subPage === 'app') return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      <SubHeader title="앱 관리" onBack={() => setSubPage(null)} />

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>📲</span> 앱 설치</div>
      <div style={S.card}>
        <button onClick={() => {
            if (installPrompt) { handleInstall(); }
            else { store.set('dm_install_dismissed', false); setShowInstallBanner(true); setShowInstallGuide(v => !v); }
          }}
          style={{ ...S.btn, background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)", color: "#fff" }}>
          앱 설치 (휴대폰 바탕화면에 바로가기 만들기)
        </button>
        {!installPrompt && showInstallGuide && (
          <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.9, marginTop: 12 }}>
            📱 <b>iOS Safari:</b> 하단 공유(□↑) 버튼 → <b>홈 화면에 추가</b><br />
            🤖 <b>Android Chrome:</b> 주소창 오른쪽 ⋮ 메뉴 → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>
          </div>
        )}
      </div>

      <div style={S.sectionTitle}>백업 & 복구</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
          • 이 앱 데이터는 각 기기 브라우저에 저장됩니다.<br />
          • JSON으로 백업하면 다른 기기에서 복구할 수 있어요.
        </div>
        <button style={S.btn} onClick={exportData}>📦 데이터 내보내기 (백업)</button>
        <button style={S.btnGhost} onClick={() => fileInputRef.current?.click()}>📥 데이터 가져오기 (복구)</button>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={importData} style={{ display: "none" }} />
      </div>

      <div style={S.sectionTitle}>고급 설정</div>
      <div style={S.card}>
        <button onClick={() => setShowEventAdvanced(v => !v)}
          style={{ ...S.btnGhost, marginTop: 0, fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>🏆 이벤트 배너 설정</span>
          <span style={{ color: 'var(--dm-muted)', fontSize: 14 }}>{showEventAdvanced ? '▲' : '▼'}</span>
        </button>
        {showEventAdvanced && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
              홈 화면에 이벤트 배너를 표시해요. 기간 내에만 노출되고 D-day가 카운트다운돼요.
            </div>
            <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 6 }}>이벤트 이름</div>
            <input style={S.input} value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="예: 3월 챌린지 🔥" maxLength={30} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>시작일</div>
                <input style={{ ...S.input, marginBottom: 0 }} type="date" value={eventStart} onChange={(e) => setEventStart(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>종료일</div>
                <input style={{ ...S.input, marginBottom: 0 }} type="date" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontWeight: 900, fontSize: 13 }}>배너 활성화</div>
              <div onClick={() => setEventActive(v => !v)} style={{
                width: 52, height: 28, borderRadius: 999,
                background: eventActive ? "#6C8EFF" : "var(--dm-border)",
                cursor: "pointer", position: "relative", flexShrink: 0,
              }}>
                <div style={{ position: "absolute", top: 4, left: eventActive ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
              </div>
            </div>
            <button style={S.btn} onClick={saveEvent}>이벤트 저장</button>
          </div>
        )}
      </div>

      <div style={{ margin: '0 16px 16px' }}>
        <button
          style={{ ...S.btnGhost, borderColor: "rgba(248,113,113,.35)", color: "#F87171", width: '100%' }}
          onClick={() => {
            if (!window.confirm("모든 데이터를 삭제할까요?")) return;
            if (!window.confirm("정말 삭제하시겠어요? (복구 불가)")) return;
            try {
              Object.keys(localStorage)
                .filter((k) => k.startsWith("dm_"))
                .forEach((k) => localStorage.removeItem(k));
            } catch {}
            window.location.reload();
          }}
        >
          🗑️ 모든 데이터 삭제
        </button>
      </div>
      <div style={{ height: 12 }} />
    </div>
  );

  // ── 전체 메뉴 데이터 ────────────────────────────────
  const ALL_MENU = [
    { category: '오늘 관리', items: [
      { icon: '📋', title: '오늘 할일', sub: '오늘의 할일 추가 & 완료', action: () => onChangeScreen?.('today') },
      { icon: '⏱️', title: '포커스 타이머', sub: '집중 타이머 챌린지', action: () => onChangeScreen?.('home') },
      { icon: '✅', title: '습관 체크', sub: '매일 반복 습관 관리', action: () => onChangeScreen?.('home') },
      { icon: '📝', title: '일기 & 메모', sub: '오늘 일기 & 메모 작성', action: () => onChangeScreen?.('today') },
    ]},
    { category: '기록 & 분석', items: [
      { icon: '📅', title: '달력', sub: '월별 할일 달성 기록', action: () => onChangeScreen?.('history') },
      { icon: '📊', title: '통계', sub: 'XP · 레벨 · 습관 달성률', action: () => onOpenStats?.() },
      { icon: '💹', title: '투자 일기', sub: '투자 기록 & 포트폴리오', action: () => onChangeScreen?.('invest') },
    ]},
    { category: '동기부여', items: [
      { icon: '⚡', title: 'XP & 레벨', sub: '경험치 & 등급 확인', action: () => onChangeScreen?.('home') },
      { icon: '🔮', title: '오늘의 운세', sub: '운세 · 사주 · 토정비결', action: () => onChangeScreen?.('home') },
      { icon: '💬', title: '오늘의 명언', sub: '날마다 바뀌는 명언', action: () => onChangeScreen?.('home') },
    ]},
    { category: '커뮤니티', items: [
      { icon: '👥', title: '커뮤니티', sub: '일정 공유 & 소통', action: () => onChangeScreen?.('community') },
      { icon: '🏆', title: '전체 랭킹', sub: '다른 사용자와 순위 비교', action: () => onOpenStats?.() },
      { icon: '🎁', title: '친구 초대', sub: '초대 코드로 XP 획득', action: () => setSubPage('friends') },
    ]},
    { category: '설정', items: [
      { icon: '👤', title: '프로필 & 목표', sub: '이름 · 생년월일 · 연간 목표', action: () => setSubPage('profile') },
      { icon: '🔔', title: '알림 설정', sub: '알림 · 소리 · 진동', action: () => setSubPage('notifications') },
      { icon: '📨', title: '텔레그램 자동화', sub: '봇 설정 · 아침 브리핑', action: () => setSubPage('telegram') },
      { icon: '🔗', title: 'Google 연동', sub: '계정 · 캘린더 · 드라이브', action: () => setSubPage('integrations') },
      { icon: '⚙️', title: '앱 관리', sub: '설치 · 백업 · 데이터 초기화', action: () => setSubPage('app') },
      { icon: '🧭', title: '인생 플랜', sub: '라이프 코치와 목표 설정', action: () => onOpenLifeCoach?.() },
    ]},
  ];
  const allItems = ALL_MENU.flatMap(g => g.items.map(it => ({ ...it, category: g.category })));
  const menuSearchResults = menuSearch.trim()
    ? allItems.filter(it => (it.title + it.sub + it.category).toLowerCase().includes(menuSearch.toLowerCase()))
    : [];

  // ── 메인 메뉴 ──────────────────────────────────────
  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.topbar}>
        <div style={{ flex: 1 }}>
          <div style={S.title}>설정</div>
        </div>
        <button
          onClick={() => setIsDark(v => !v)}
          style={{ width: 38, height: 38, borderRadius: 999,
            border: "1.5px solid var(--dm-border)", background: "var(--dm-input)", fontSize: 18,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0 }}>
          {isDark ? "☀️" : "🌙"}
        </button>
      </div>

      {/* ── 검색바 ── */}
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--dm-muted)', pointerEvents: 'none' }}>🔍</span>
          <input
            value={menuSearch}
            onChange={e => setMenuSearch(e.target.value)}
            placeholder="기능 검색..."
            style={{ ...S.input, marginBottom: 0, paddingLeft: 34, fontSize: 14 }}
          />
        </div>
        <button onClick={() => setShowAllMenu(true)} style={{
          background: 'rgba(75,111,255,.12)', border: '1.5px solid rgba(108,142,255,.35)',
          borderRadius: 12, padding: '0 14px', cursor: 'pointer', fontSize: 12,
          fontWeight: 900, color: '#6C8EFF', whiteSpace: 'nowrap', flexShrink: 0,
        }}>전체메뉴</button>
      </div>

      {/* ── 검색 결과 ── */}
      {menuSearchResults.length > 0 && (
        <div style={{ margin: '0 16px 12px', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--dm-border)' }}>
          {menuSearchResults.map((it, i) => (
            <div key={i} onClick={() => { it.action(); setMenuSearch(''); }} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              background: i % 2 === 0 ? 'var(--dm-card)' : 'var(--dm-row)',
              borderBottom: i < menuSearchResults.length - 1 ? '1px solid var(--dm-border)' : 'none',
              cursor: 'pointer',
            }}>
              <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{it.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dm-text)' }}>{it.title}</div>
                <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 1 }}>{it.category} · {it.sub}</div>
              </div>
              <span style={{ color: 'var(--dm-muted)', fontSize: 18 }}>›</span>
            </div>
          ))}
        </div>
      )}
      {menuSearch.trim() && menuSearchResults.length === 0 && (
        <div style={{ margin: '0 16px 12px', padding: '14px 16px', textAlign: 'center', fontSize: 13, color: 'var(--dm-muted)', background: 'var(--dm-card)', borderRadius: 14, border: '1px solid var(--dm-border)' }}>
          검색 결과가 없어요
        </div>
      )}

      {/* ── 전체메뉴 모달 ── */}
      {showAllMenu && (
        <div onClick={() => setShowAllMenu(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--dm-bg)', borderRadius: '22px 22px 0 0',
            width: '100%', maxWidth: 480, maxHeight: '85vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 -12px 48px rgba(0,0,0,0.5)',
            animation: 'slideUp 0.22s ease-out',
          }}>
            <div style={{ padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--dm-border)' }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--dm-text)' }}>📱 전체 메뉴</div>
              <button onClick={() => setShowAllMenu(false)} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 24px' }}>
              {ALL_MENU.map(group => (
                <div key={group.category} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, paddingLeft: 4 }}>{group.category}</div>
                  <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--dm-border)' }}>
                    {group.items.map((it, i) => (
                      <div key={i} onClick={() => { it.action(); setShowAllMenu(false); }} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                        background: i % 2 === 0 ? 'var(--dm-card)' : 'var(--dm-row)',
                        borderBottom: i < group.items.length - 1 ? '1px solid var(--dm-border)' : 'none',
                        cursor: 'pointer',
                      }}>
                        <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{it.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dm-text)' }}>{it.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 1 }}>{it.sub}</div>
                        </div>
                        <span style={{ color: 'var(--dm-muted)', fontSize: 18 }}>›</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onOpenStats}
        style={{ ...S.card, display: "flex", alignItems: "center", gap: 12,
          cursor: "pointer", color: "var(--dm-text)", textAlign: "left", marginBottom: 16 }}>
        <span style={{ fontSize: 24 }}>📊</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>통계 보기</div>
          <div style={{ fontSize: 12, color: "var(--dm-sub)", marginTop: 2 }}>레벨, XP, 습관 달성률 등</div>
        </div>
        <span style={{ marginLeft: "auto", color: "var(--dm-sub)", fontSize: 18 }}>›</span>
      </button>

      <MenuGroup label="개인">
        <MenuRow icon="👤" title="프로필 & 목표" sub={user.name} onClick={() => setSubPage('profile')} />
      </MenuGroup>

      <MenuGroup label="알림">
        <MenuRow icon="🔔" title="알림 설정" sub={notifEnabled ? '켜짐' : '꺼짐'} onClick={() => setSubPage('notifications')} />
        <MenuRow icon="📨" title="텔레그램 자동화" sub={telegramCfg.botToken ? '설정됨' : '미설정'} onClick={() => setSubPage('telegram')} />
      </MenuGroup>

      <MenuGroup label="연동">
        <MenuRow icon="🔗" title="Google 연동" sub="계정 · 캘린더 · 드라이브" onClick={() => setSubPage('integrations')} />
      </MenuGroup>

      <MenuGroup label="앱">
        <MenuRow icon="⚙️" title="앱 관리" sub="설치 · 백업 · 데이터" onClick={() => setSubPage('app')} />
      </MenuGroup>

      <MenuGroup label="소셜">
        <MenuRow icon="👥" title="친구 & 공유" onClick={() => setSubPage('friends')} />
      </MenuGroup>

      <div style={{ padding: '8px 16px' }}>
        <button onClick={onOpenLifeCoach} style={{ ...S.btnGhost, boxShadow: 'none', fontSize: 13 }}>
          🧭 인생 플랜 다시 만들기
        </button>
      </div>

      {authUser && onOpenAdmin && (
        <div style={{ padding: '8px 16px' }}>
          <button onClick={onOpenAdmin} style={{ ...S.btnGhost, background: 'transparent', color: 'var(--dm-muted)', border: '1px dashed var(--dm-border)', boxShadow: 'none', fontSize: 12, position: 'relative' }}>
            🛠 관리자 페이지
            {pendingSuggestions > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, fontSize: 10, fontWeight: 900, background: '#F87171', color: '#fff', borderRadius: 999, padding: '2px 6px', lineHeight: 1 }}>{pendingSuggestions}</span>
            )}
          </button>
        </div>
      )}

      {authUser && (
        <MenuGroup label="기타">
          <MenuRow icon="💡" title="개선 제안하기" sub="앱 기능 개선 아이디어를 보내주세요"
            onClick={() => { setSuggestionOpen(true); setSuggestionDone(false); }} />
        </MenuGroup>
      )}

      <div style={{ padding: '16px 18px', textAlign: 'center', color: 'var(--dm-muted)', fontSize: 12 }}>DayMate Lite {APP_VERSION} · {APP_BUILD}</div>
      <div style={{ height: 12 }} />

      {/* 제안 모달 */}
      {suggestionOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setSuggestionOpen(false)}>
          <div style={{ background: 'var(--dm-card)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '24px 24px 0 0', padding: '20px 16px 24px', width: '100%', marginBottom: 84 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>💡 개선 제안하기</div>
              <button onClick={() => setSuggestionOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>✕</button>
            </div>
            {suggestionDone ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>제안이 접수됐어요!</div>
                <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginBottom: 20 }}>검토 후 반영 여부를 알려드릴게요.</div>
                <button onClick={() => setSuggestionOpen(false)} style={{ ...S.btn, background: 'linear-gradient(135deg,#4B6FFF,#6C8EFF)', width: 'auto', padding: '10px 28px' }}>확인</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginBottom: 8 }}>
                  작성자: <span style={{ color: 'var(--dm-sub)', fontWeight: 700 }}>{maskEmail(authUser?.email)}</span>
                </div>
                <textarea
                  value={suggestionText}
                  onChange={e => setSuggestionText(e.target.value)}
                  placeholder="개선 아이디어나 불편한 점을 자유롭게 작성해주세요"
                  rows={5}
                  maxLength={500}
                  style={{ ...S.input, resize: 'none', marginBottom: 6 }}
                />
                <div style={{ fontSize: 11, color: 'var(--dm-muted)', textAlign: 'right', marginBottom: 12 }}>{suggestionText.length}/500</div>
                <button onClick={handleSubmitSuggestion}
                  disabled={submittingSuggestion || !suggestionText.trim()}
                  style={{ ...S.btn, background: 'linear-gradient(135deg,#4B6FFF,#6C8EFF)', marginTop: 0 }}>
                  {submittingSuggestion ? '제출 중...' : '💡 제안 제출하기'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
