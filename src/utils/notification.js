export const hasNotification = () =>
  typeof window !== "undefined" && "Notification" in window;

export const getPermission = () => {
  if (!hasNotification()) return "unsupported";
  return Notification.permission; // default | granted | denied
};

export const requestPermission = async () => {
  if (!hasNotification()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
};

export const SOUND_STYLES = [
  { id: 'beep',   label: '비프',       desc: '짧은 단음' },
  { id: 'dingdong', label: '딩동',     desc: '두 음 차임벨' },
  { id: 'triple', label: '트리플',     desc: '세 번 띵띵띵' },
  { id: 'soft',   label: '부드러운',   desc: '페이드인 종소리' },
];

const _beep = (ctx) => {
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
  g.gain.setValueAtTime(0.3, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
};

const _dingdong = (ctx) => {
  [[523, 0], [392, 0.25]].forEach(([freq, delay]) => {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.5);
    osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.5);
  });
};

const _triple = (ctx) => {
  [0, 0.2, 0.4].forEach(delay => {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime + delay);
    g.gain.setValueAtTime(0.3, ctx.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
    osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.15);
  });
};

const _soft = (ctx) => {
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(528, ctx.currentTime);
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8);
};

export const playNotifSound = (style) => {
  try {
    const s = style || localStorage.getItem('dm_notif_sound_style') || 'beep';
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (s === 'dingdong') _dingdong(ctx);
    else if (s === 'triple') _triple(ctx);
    else if (s === 'soft') _soft(ctx);
    else _beep(ctx);
  } catch { /* ignore */ }
};

export const triggerVibration = () => {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
};

export const TTS_DEFAULT_MESSAGES = {
  morning:     '좋은 아침이에요! 오늘 하루도 화이팅!',
  morningWork: '오늘 할 일을 입력할 시간이에요.',
  noon:        '점심 체크인! 오전 할 일 얼마나 완료했나요?',
  evening:     '저녁 체크인! 오늘 하루 잘 보내고 있나요?',
  night:       '하루 마무리할 시간이에요. 일기도 써보세요.',
};

export const speakTTS = (text) => {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = 0.95;
    utter.pitch = 1.05;
    window.speechSynthesis.speak(utter);
  } catch { /* ignore */ }
};

export const sendNotification = (title, body, iconEmoji = "✅") => {
  if (!hasNotification()) return null;
  if (Notification.permission !== "granted") return null;
  try {
    const iconSvg =
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${iconEmoji}</text></svg>`
      );
    const n = new Notification(title, {
      body,
      icon: iconSvg,
      badge: iconSvg,
      tag: "daymate-" + Date.now(),
      requireInteraction: false,
    });
    n.onclick = () => {
      try { window.focus(); } catch { /* ignore */ }
      try { n.close(); } catch { /* ignore */ }
    };

    return n;
  } catch {
    return null;
  }
};
