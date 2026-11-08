// 💳 구독 관리 (2026-11-08) — 한 달에 얼마 나가는지, 어떤 걸로 결제하는지. 계산은 utils/subscriptions.js
// 직접 입력만(카드 내역 불러오기 없음), 결제수단은 별명만 저장(카드번호 안 받음).
import { useMemo, useRef, useState } from "react";
import { useUsdKrw } from "../utils/useUsdKrw.js";
import { createPortal } from "react-dom";
import S, { UI, boxCard } from "../styles.js";
import { toDateStr } from "../utils/date.js";
import { daysUntil } from "../utils/exam.js";
import { store } from "../utils/storage.js";
import { useUndo, putBack } from "../utils/useUndo.js";
import { useBackClose } from "../utils/useBackClose.js";
import UndoBar from "../components/UndoBar.jsx";
import { SectionIcon } from "../components/TodayLook.jsx";
import {
  SUB_CATS, subCatLabel, normalizeSubs, newSubId, nextBillDate, isActive, subsSummary, toKrw, monthlyOf,
  fmtMoney, fmtKrw, billDayLabel, payOptions, SUBS_TODAY_KEY,
} from "../utils/subscriptions.js";

const ACCENT = "var(--dm-accent, #5B7CFA)";

const ddayText = (n) => (n === 0 ? "오늘" : n === 1 ? "내일" : `D-${n}`);

// My 탭 칸 — 월 합계 + 다음 결제 한 줄, 누르면 구독 화면
export function SubsCard({ subs, onOpen, style }) {
  const today = toDateStr();
  const list = useMemo(() => normalizeSubs(subs), [subs]);
  const rate = useUsdKrw(list.some((s) => s.cur === "USD"));
  const sum = useMemo(() => subsSummary(list, today, rate), [list, today, rate]);
  const next = useMemo(() => list.map((s) => ({ s, ds: nextBillDate(s, today) })).filter((x) => x.ds).sort((a, b) => a.ds.localeCompare(b.ds))[0], [list, today]);
  return (
    <div style={{ ...boxCard, ...style }}>
      <button onClick={onOpen} style={{ display: "block", width: "100%", padding: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--dm-text)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: UI.headingGap, fontSize: UI.title, fontWeight: 900 }}>
          <SectionIcon name="wallet" size={20} badge />구독<span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800, color: ACCENT }}>{list.length ? "관리 ›" : "＋ 추가"}</span>
        </div>
        {list.length === 0 ? (
          <div style={{ fontSize: 15, color: "var(--dm-sub)" }}>넷플릭스·유튜브·AI 같은 구독을 넣으면 한 달에 얼마 나가는지 보여요</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 26, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{fmtKrw(sum.monthly)}</span>
              <span style={{ fontSize: 14, color: "var(--dm-sub)" }}>한 달 · 구독 {sum.count}개</span>
            </div>
            {next && (
              <div style={{ marginTop: 6, fontSize: 15, color: "var(--dm-sub)" }}>
                다음 결제 <b style={{ color: "var(--dm-text)" }}>{next.s.name}</b> · {Number(next.ds.slice(5, 7))}/{Number(next.ds.slice(8, 10))} ({ddayText(daysUntil(next.ds, today))}) · {fmtMoney(next.s.amount, next.s.cur)}
              </div>
            )}
          </>
        )}
      </button>
    </div>
  );
}

export default function Subscriptions({ subs, setSubs, onBack }) {
  const today = toDateStr();
  const list = useMemo(() => normalizeSubs(subs), [subs]);
  const rate = useUsdKrw(list.some((s) => s.cur === "USD"));
  const sum = useMemo(() => subsSummary(list, today, rate), [list, today, rate]);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null); // 'new' 또는 구독 id
  const [showToday, setShowToday] = useState(() => store.get(SUBS_TODAY_KEY, true) !== false);
  const undo = useUndo();

  const cats = SUB_CATS.filter((c) => list.some((s) => s.cat === c.id));
  const rows = useMemo(() => list
    .filter((s) => filter === "all" || s.cat === filter)
    .map((s) => ({ s, ds: nextBillDate(s, today), active: isActive(s, today) }))
    .sort((a, b) => (a.active === b.active ? (a.ds || "9999").localeCompare(b.ds || "9999") : a.active ? -1 : 1)), [list, filter, today]);

  const save = (sub) => {
    setSubs((prev) => {
      const cur = normalizeSubs(prev);
      return cur.some((x) => x.id === sub.id) ? cur.map((x) => (x.id === sub.id ? sub : x)) : [...cur, sub];
    });
    setEditing(null);
  };
  const remove = (sub) => {
    const idx = list.findIndex((x) => x.id === sub.id);
    setSubs((prev) => normalizeSubs(prev).filter((x) => x.id !== sub.id));
    setEditing(null);
    undo.offer(`"${sub.name}" 구독을 지웠어요`, () => setSubs((prev) => putBack(normalizeSubs(prev), sub, idx)));
  };
  const toggleToday = () => { const v = !showToday; setShowToday(v); store.set(SUBS_TODAY_KEY, v); };

  const chip = (on) => ({ height: 36, padding: "0 14px", borderRadius: 999, border: "none", background: on ? ACCENT : "var(--dm-input)", color: on ? "#fff" : "var(--dm-sub)", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });

  return (
    <div style={{ paddingBottom: 110 }}>
      <UndoBar bar={undo.bar} onUndo={undo.run} />
      <div style={S.topbar}>
        <button className="dm-hit" onClick={onBack} aria-label="뒤로" style={{ background: "transparent", border: "none", color: "var(--dm-text)", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ flex: 1, marginLeft: 10 }}>
          <div style={S.title}>💳 구독</div>
          <div style={{ ...S.sub, fontSize: UI.sub }}>흩어진 구독과 정기결제를 한눈에</div>
        </div>
      </div>

      <div style={{ ...boxCard, marginTop: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--dm-sub)" }}>한 달 구독료 (월 환산)</div>
        <div style={{ fontSize: 34, fontWeight: 900, color: "var(--dm-text)", fontVariantNumeric: "tabular-nums", margin: "2px 0 4px" }}>{fmtKrw(sum.monthly)}</div>
        <div style={{ fontSize: 14, color: "var(--dm-sub)" }}>구독 {sum.count}개 · 1년 {fmtKrw(sum.yearly)}</div>
        {sum.missingFx > 0 && <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 4 }}>환율을 못 받아 달러 구독 {sum.missingFx}개는 빠졌어요</div>}
        {rate && list.some((s) => s.cur === "USD") && <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 4 }}>달러는 오늘 환율 {Math.round(rate).toLocaleString("ko-KR")}원으로 계산</div>}
        {sum.byPay.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--dm-sub)", marginBottom: 4 }}>결제수단별</div>
            {sum.byPay.map(([name, v], i) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--dm-row)" : "none", fontSize: 15 }}>
                <span style={{ color: name === "결제수단 미정" ? "var(--dm-muted)" : "var(--dm-text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtKrw(v)}</span>
              </div>
            ))}
          </div>
        )}
        {sum.byCat.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 10, fontSize: 14, color: "var(--dm-sub)" }}>
            {sum.byCat.map(([id, v]) => <span key={id}>{subCatLabel(id)} <b style={{ color: "var(--dm-text)" }}>{fmtKrw(v)}</b></span>)}
          </div>
        )}
      </div>

      <div style={boxCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: UI.title, fontWeight: 900, color: "var(--dm-text)" }}>
          <SectionIcon name="wallet" size={20} badge />내 구독
          <button className="dm-hit" onClick={() => setEditing("new")} style={{ marginLeft: "auto", height: 32, padding: "0 4px", background: "none", border: "none", color: ACCENT, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>＋ 추가</button>
        </div>
        {cats.length > 1 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
            <button onClick={() => setFilter("all")} style={chip(filter === "all")}>전체</button>
            {cats.map((c) => <button key={c.id} onClick={() => setFilter(c.id)} style={chip(filter === c.id)}>{c.label}</button>)}
          </div>
        )}
        {list.length === 0 && (
          <div style={{ padding: "8px 0 4px", fontSize: 15, color: "var(--dm-sub)", lineHeight: 1.6 }}>
            아직 구독이 없어요. ＋ 추가로 넷플릭스·유튜브 프리미엄·ChatGPT 같은 구독을 넣어 보세요. 결제일은 오늘 탭 "다가오는 날"과 달력에 보여요.
          </div>
        )}
        {rows.map(({ s, ds, active }, i) => {
          const krw = s.cur === "USD" ? toKrw(monthlyOf(s), "USD", rate) : null;
          return (
            <button key={s.id} onClick={() => setEditing(s.id)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 0", background: "none", border: "none", borderTop: i ? "1px solid var(--dm-row)" : "none", borderRadius: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--dm-text)", opacity: active ? 1 : 0.5 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 17, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ display: "block", fontSize: 14, color: "var(--dm-sub)", marginTop: 2 }}>
                  {active ? billDayLabel(s) : (s.trial ? "무료 체험 끝남" : "이용 끝남")}{s.pay ? ` · ${s.pay}` : ""}
                  {active && ds && <b style={{ color: daysUntil(ds, today) <= 3 ? "#FF3B30" : ACCENT, fontWeight: 800 }}> · {ddayText(daysUntil(ds, today))}</b>}
                  {active && s.endDate && <span> · {s.trial ? "체험" : "종료"} {Number(s.endDate.slice(5, 7))}/{Number(s.endDate.slice(8, 10))}</span>}
                </span>
              </span>
              <span style={{ flexShrink: 0, textAlign: "right" }}>
                <span style={{ display: "block", fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(s.amount, s.cur)}</span>
                <span style={{ display: "block", fontSize: 13, color: "var(--dm-muted)", marginTop: 2 }}>
                  {s.cycle === "year" ? `매년 · 월 ${krw != null ? fmtKrw(krw) : fmtMoney(monthlyOf(s), s.cur)}` : krw != null ? `약 ${fmtKrw(krw)}` : "매월"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <button onClick={toggleToday} role="switch" aria-checked={showToday} style={{ ...boxCard, display: "flex", alignItems: "center", gap: 12, width: "calc(100% - 32px)", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--dm-text)" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 16, fontWeight: 800 }}>오늘 탭에 결제일 보이기</span>
          <span style={{ display: "block", fontSize: 13, color: "var(--dm-sub)", marginTop: 2 }}>결제일·체험 끝나는 날 3일 전부터 "다가오는 날"에 (이 기기만)</span>
        </span>
        <span aria-hidden style={{ width: 50, height: 30, borderRadius: 99, background: showToday ? "#34C759" : "var(--dm-input)", position: "relative", flexShrink: 0, transition: "background .2s" }}>
          <span style={{ position: "absolute", top: 3, left: showToday ? 23 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
        </span>
      </button>

      {editing && (
        <SubSheet
          initial={editing === "new" ? null : list.find((s) => s.id === editing)}
          payChoices={payOptions(list)} rate={rate}
          onSave={save} onDelete={remove} onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// 추가·고치기 창 (토스 "구독 추가" 참고) — 분류 → 이름 → 금액·주기 → 결제일 → 결제수단 → 종료일·메모
function SubSheet({ initial, payChoices, rate, onSave, onDelete, onClose }) {
  useBackClose(onClose);
  const [cat, setCat] = useState(initial?.cat || "ott");
  const [name, setName] = useState(initial?.name || "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [cur, setCur] = useState(initial?.cur || "KRW");
  const [cycle, setCycle] = useState(initial?.cycle || "month");
  const [day, setDay] = useState(initial ? initial.day : Number(toDateStr().slice(8, 10)));
  const [month, setMonth] = useState(initial?.month || Number(toDateStr().slice(5, 7)));
  const [pay, setPay] = useState(initial?.pay || "");
  const [endDate, setEndDate] = useState(initial?.endDate || "");
  const [trial, setTrial] = useState(!!initial?.trial);
  const [memo, setMemo] = useState(initial?.memo || "");
  const nameRef = useRef(null);

  const num = Number(String(amount).replace(/,/g, ""));
  const valid = name.trim() && num > 0;
  const monthly = num > 0 ? (cycle === "year" ? num / 12 : num) : 0;
  const monthlyKrw = toKrw(monthly, cur, rate);
  const services = (SUB_CATS.find((c) => c.id === cat) || SUB_CATS[0]).services;

  const submit = () => {
    if (!valid) { nameRef.current?.focus(); return; }
    onSave({
      id: initial?.id || newSubId(), cat, name: name.trim(), amount: num, cur, cycle, day, month,
      pay: pay.trim(), endDate, trial: !!endDate && trial, memo: memo.trim(),
    });
  };

  const label = { display: "block", fontSize: 15, fontWeight: 900, color: "var(--dm-text)", margin: "18px 0 8px" };
  const input = { ...S.input, fontSize: 16, padding: "12px 14px", border: "none", borderRadius: 12 };
  const pill = (on) => ({ height: 38, padding: "0 14px", borderRadius: 999, border: "none", background: on ? ACCENT : "var(--dm-input)", color: on ? "#fff" : "var(--dm-text)", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
  const seg = (on) => ({ flex: 1, height: 38, border: "none", borderRadius: 10, background: on ? ACCENT : "transparent", color: on ? "#fff" : "var(--dm-sub)", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", padding: 0 });
  const dayCell = (on) => ({ height: 40, border: "none", borderRadius: 10, background: on ? ACCENT : "var(--dm-input)", color: on ? "#fff" : "var(--dm-text)", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", padding: 0 });

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={initial ? "구독 고치기" : "구독 추가"}
        style={{ width: "100%", maxWidth: 430, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "var(--dm-bg)", borderRadius: "20px 20px 0 0", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px 6px" }}>
          <div style={{ flex: 1, fontSize: 21, fontWeight: 900, color: "var(--dm-text)" }}>{initial ? "구독 고치기" : "구독 추가"}</div>
          <button className="dm-hit" onClick={onClose} aria-label="닫기" style={{ width: 32, height: 32, padding: 0, background: "none", border: "none", color: "var(--dm-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px 16px" }}>
          <span style={{ ...label, marginTop: 8 }}>분류</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SUB_CATS.map((c) => <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={cat === c.id} style={pill(cat === c.id)}>{c.label}</button>)}
          </div>

          <label style={label} htmlFor="sub-name">서비스 이름</label>
          <input id="sub-name" ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="직접 쓰거나 아래에서 고르기" style={input} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {services.map((sv) => <button key={sv} onClick={() => setName(sv)} style={{ ...pill(name === sv), height: 34, fontSize: 13 }}>{sv}</button>)}
          </div>

          <label style={label} htmlFor="sub-amount">금액</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input id="sub-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={cur === "USD" ? "달러" : "원"} style={{ ...input, flex: 1, minWidth: 0 }} />
            <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 12, background: "var(--dm-input)", width: 120, flexShrink: 0 }}>
              <button onClick={() => setCur("KRW")} aria-pressed={cur === "KRW"} style={seg(cur === "KRW")}>원</button>
              <button onClick={() => setCur("USD")} aria-pressed={cur === "USD"} style={seg(cur === "USD")}>달러</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 12, background: "var(--dm-input)", marginTop: 8 }}>
            <button onClick={() => setCycle("month")} aria-pressed={cycle === "month"} style={seg(cycle === "month")}>매월</button>
            <button onClick={() => setCycle("year")} aria-pressed={cycle === "year"} style={seg(cycle === "year")}>매년</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "10px 14px", borderRadius: 12, background: "var(--dm-card)", fontSize: 15 }}>
            <span style={{ color: "var(--dm-sub)" }}>월 환산</span>
            <b style={{ color: "var(--dm-text)", fontVariantNumeric: "tabular-nums" }}>{monthlyKrw != null ? fmtKrw(monthlyKrw) : fmtMoney(monthly, cur)}</b>
          </div>

          <span style={label}>결제일</span>
          {cycle === "year" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 6, marginBottom: 8 }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <button key={m} onClick={() => setMonth(m)} aria-pressed={month === m} style={dayCell(month === m)}>{m}월</button>)}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <button key={d} onClick={() => setDay(d)} aria-pressed={day === d} aria-label={`${d}일`} style={dayCell(day === d)}>{d}</button>)}
            <button onClick={() => setDay(0)} aria-pressed={day === 0} style={{ ...dayCell(day === 0), gridColumn: "span 4", fontSize: 14 }}>말일</button>
          </div>
          <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 6 }}>{cycle === "year" ? `매년 ${month}월 ${day === 0 ? "말일" : `${day}일`}` : `매월 ${day === 0 ? "말일" : `${day}일`}`}{day > 28 ? " · 그 날이 없는 달은 말일" : ""}</div>

          <label style={label} htmlFor="sub-pay">결제수단 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dm-muted)" }}>(별명만, 카드번호는 쓰지 마세요)</span></label>
          <input id="sub-pay" value={pay} onChange={(e) => setPay(e.target.value)} maxLength={20} placeholder="예: 신한카드 개인, 토스 계좌" style={input} />
          {payChoices.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {payChoices.map((p) => <button key={p} onClick={() => setPay(p)} style={{ ...pill(pay === p), height: 34, fontSize: 13 }}>{p}</button>)}
            </div>
          )}

          <label style={label} htmlFor="sub-end">이용 종료일 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dm-muted)" }}>(선택)</span></label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input id="sub-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ ...input, flex: 1, minWidth: 0 }} />
            {endDate && <button onClick={() => { setEndDate(""); setTrial(false); }} style={{ height: 44, padding: "0 12px", border: "none", borderRadius: 12, background: "var(--dm-input)", color: "var(--dm-sub)", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>지우기</button>}
          </div>
          {endDate && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 15, color: "var(--dm-text)", cursor: "pointer" }}>
              <input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} style={{ width: 20, height: 20 }} />
              무료 체험이에요 (끝나기 3일 전에 알려 줘요)
            </label>
          )}

          <label style={label} htmlFor="sub-memo">메모 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dm-muted)" }}>(선택)</span></label>
          <textarea id="sub-memo" value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={300} placeholder="해지 방법처럼 기억할 내용" style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
        </div>
        <div style={{ display: "flex", gap: 8, padding: "10px 20px calc(14px + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid var(--dm-row)" }}>
          {initial && <button onClick={() => onDelete(initial)} style={{ height: 50, padding: "0 18px", border: "none", borderRadius: 14, background: "var(--dm-input)", color: "#FF3B30", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>삭제</button>}
          <button onClick={submit} disabled={!valid} style={{ flex: 1, height: 50, border: "none", borderRadius: 14, background: valid ? ACCENT : "var(--dm-input)", color: valid ? "#fff" : "var(--dm-muted)", fontSize: 17, fontWeight: 900, cursor: valid ? "pointer" : "default", fontFamily: "inherit" }}>저장</button>
        </div>
      </div>
    </div>,
    document.querySelector(".dm-phone") || document.body,
  );
}
