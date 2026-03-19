import { sendNotification, getPermission, playNotifSound, triggerVibration } from '../utils/notification.js';
import { toDateStr } from '../utils/date.js';
import { store } from '../utils/storage.js';
import { ASSET_META, sendTelegramMessage, fetchMarketDataFromServer, buildBriefingText } from './telegram.js';

const DAY_KEY = (dateStr) => `dm_day_${dateStr}`;

// setTimeout 기반 (탭 열려있을 때만 동작)
class NotifScheduler {
  constructor() {
    this.timers = {};
  }

  cancelAll() {
    Object.keys(this.timers).forEach((k) => {
      clearTimeout(this.timers[k]);
      delete this.timers[k];
    });
  }

  msUntil(timeStr) {
    const [hh, mm] = timeStr.split(":").map(Number);
    const now = new Date();
    const t = new Date();
    t.setHours(hh, mm, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    return t.getTime() - now.getTime();
  }

  schedule(id, timeStr, title, body, iconEmoji = "🔔", onFire = null) {
    clearTimeout(this.timers[id]);
    const fire = async () => {
      try {
        if (localStorage.getItem('dm_notif_sound') !== 'false') playNotifSound();
        if (localStorage.getItem('dm_notif_vibration') !== 'false') triggerVibration();
      } catch { /* ignore */ }
      sendNotification(title, body, iconEmoji);
      if (onFire) {
        try { await onFire(); } catch {}
      }
      this.timers[id] = setTimeout(fire, 24 * 60 * 60 * 1000);
    };
    this.timers[id] = setTimeout(fire, this.msUntil(timeStr));
  }

  scheduleTaskAlarms(tasks, userName, enabled) {
    // 기존 task_ 타이머 제거
    Object.keys(this.timers).filter(k => k.startsWith('task_')).forEach(k => {
      clearTimeout(this.timers[k]);
      delete this.timers[k];
    });
    if (!enabled || getPermission() !== 'granted') return;
    const now = new Date();
    tasks.filter(t => t.title?.trim() && t.time && !t.done).forEach(t => {
      const [hh, mm] = t.time.split(':').map(Number);
      const fireAt = new Date();
      fireAt.setHours(hh, mm, 0, 0);
      const ms = fireAt.getTime() - now.getTime();
      if (ms > 0) {
        this.timers[`task_${t.id}`] = setTimeout(() => {
          sendNotification('DayMate ⏰', `할 일: ${t.title}`, '⏰');
          delete this.timers[`task_${t.id}`];
        }, ms);
      }
    });
  }

  apply(enabled, userName, telegramCfg = {}, alarmTimes = {}) {
    this.cancelAll();
    if (!enabled) return;

    const { botToken = '', chatId = '', briefingTime = '07:00', todoTime = '07:05', assets, customAssets: rawCustomAssets } = telegramCfg;
    const selectedAssets = assets && assets.length > 0 ? assets : Object.keys(ASSET_META);
    const customAssetsArr = rawCustomAssets || [];
    const customRegistry = Object.fromEntries(customAssetsArr.map(a => [a.sym, a]));
    const morningTime = alarmTimes.morning || '07:30';
    const morningWorkTime = alarmTimes.morningWork || '09:00';
    const noonTime = alarmTimes.noon || '12:00';
    const eveningTime = alarmTimes.evening || '18:00';
    const nightTime = alarmTimes.night || '23:00';
    const hasTg = !!(botToken && chatId);

    if (hasTg) {
      this.schedule(
        'tg_market', briefingTime,
        'DayMate 📊', '아침 자산 브리핑을 텔레그램으로 전송 중...',
        '📊',
        async () => {
          const weatherRes = await fetch(`/api/weather?city=${encodeURIComponent(telegramCfg.weatherCity || 'Seoul')}`).then(r => r.json()).catch(() => null);
          const weather = weatherRes?.ok ? weatherRes : null;
          const marketData = await fetchMarketDataFromServer(selectedAssets, customRegistry);
          const text = buildBriefingText(marketData, userName, weather);
          await sendTelegramMessage(botToken, chatId, text);
        }
      );

      this.schedule(
        'tg_todo', todoTime,
        'DayMate ✅', '오늘 할 일을 텔레그램으로 전송',
        '✅',
        async () => {
          const today = toDateStr();
          const todayDayData = store.get(DAY_KEY(today));
          const tasks = (todayDayData?.tasks || []).filter(t => t.title.trim());
          let text = `✅ <b>${userName}님, 오늘 할 일!</b>\n\n`;
          if (tasks.length > 0) {
            tasks.forEach((t, i) => { text += `${i + 1}. ${t.title}\n`; });
            text += `\n총 ${tasks.length}개 예정 · 화이팅! 💪`;
          } else {
            text += `아직 오늘 할 일을 입력하지 않았어요.\nDayMate에서 입력해주세요 📝`;
          }
          await sendTelegramMessage(botToken, chatId, text);
        }
      );
    }

    if (getPermission() !== "granted") return;

    this.schedule(
      'm_morning', morningTime,
      'DayMate 🌅', `${userName}님, 좋은 아침! 오늘 할 일을 정해볼까요?`, '🌅',
      hasTg ? async () => {
        const d = store.get(DAY_KEY(toDateStr()));
        const tasks = (d?.tasks || []).filter(t => t.title.trim());
        let text = `🌅 <b>${userName}님, 좋은 아침이에요!</b>\n\n`;
        if (tasks.length > 0) {
          text += `📋 오늘의 할일\n`;
          tasks.forEach((t, i) => { text += `  ${i + 1}. ${t.title}\n`; });
        } else {
          text += `오늘 할 일을 아직 입력하지 않았어요.\nDayMate에서 하루를 계획해보세요 📝`;
        }
        text += `\n\n<a href="https://daymate-beta.vercel.app">📱 DayMate 열기</a>`;
        await sendTelegramMessage(botToken, chatId, text);
      } : null
    );

    this.schedule(
      'm_morning_work', morningWorkTime,
      'DayMate ☀️', `${userName}님, 오늘 할 일을 입력해볼까요?`, '☀️',
      hasTg ? async () => {
        const d = store.get(DAY_KEY(toDateStr()));
        const tasks = (d?.tasks || []).filter(t => t.title.trim());
        let text = `☀️ <b>${userName}님, 오늘 할 일을 정리해볼 시간이에요!</b>\n\n`;
        if (tasks.length > 0) {
          text += `📋 입력된 할일\n`;
          tasks.forEach((t, i) => { text += `  ${i + 1}. ${t.title}\n`; });
          text += `\n화이팅! 💪`;
        } else {
          text += `아직 오늘 할 일을 입력하지 않았어요.\n지금 바로 입력해보세요! 📝\n\n<a href="https://daymate-beta.vercel.app">📱 DayMate 열기</a>`;
        }
        await sendTelegramMessage(botToken, chatId, text);
      } : null
    );

    this.schedule(
      'm_noon', noonTime,
      'DayMate 🕛', `${userName}님, 점심 체크인!`, '🕛',
      hasTg ? async () => {
        const d = store.get(DAY_KEY(toDateStr()));
        const tasks = d?.tasks || [];
        const done = tasks.filter(t => t.done && t.title.trim()).length;
        const total = tasks.filter(t => t.title.trim()).length;
        await sendTelegramMessage(botToken, chatId,
          `🕛 <b>${userName}님 점심 체크인!</b>\n\n✅ 완료: ${done}/${total}\n\n오후도 화이팅! 💪`
        );
      } : null
    );

    this.schedule(
      'm_eve', eveningTime,
      'DayMate 🌆', `${userName}님, 저녁 체크인!`, '🌆',
      hasTg ? async () => {
        const d = store.get(DAY_KEY(toDateStr()));
        const tasks = d?.tasks || [];
        const done = tasks.filter(t => t.done && t.title.trim()).length;
        const total = tasks.filter(t => t.title.trim()).length;
        await sendTelegramMessage(botToken, chatId,
          `🌆 <b>${userName}님 저녁 체크인!</b>\n\n✅ 완료: ${done}/${total}\n\n마무리 잘 해요! 🎯`
        );
      } : null
    );

    this.schedule(
      'm_night', nightTime,
      'DayMate 🌙', `${userName}님, 마지막 체크 + 일기 작성하고 마무리해요.`, '🌙',
      hasTg ? async () => {
        const d = store.get(DAY_KEY(toDateStr()));
        const tasks = d?.tasks || [];
        const done = tasks.filter(t => t.done && t.title.trim()).length;
        const total = tasks.filter(t => t.title.trim()).length;
        const hasJournal = !!d?.journal?.body?.trim();
        let text = `🌙 <b>${userName}님, 하루 마무리할 시간이에요!</b>\n\n`;
        text += `✅ 완료: ${done}/${total}\n`;
        text += hasJournal ? `📖 일기: 작성 완료 ✓\n` : `📖 일기: 아직 작성 전 ✏️\n`;
        text += `\n오늘도 수고했어요! 🌟`;
        if (new Date().getDay() === 0) {
          text += `\n\n📝 <b>이번 주 회고</b>\n이번 주 잘한 점 하나와 다음 주 목표를 DayMate에 기록해보세요!`;
        }
        await sendTelegramMessage(botToken, chatId, text);
      } : null
    );
  }
}

export const scheduler = new NotifScheduler();
