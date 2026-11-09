import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import S, { UI, boxCard } from "../styles.js";
import Toast from "../components/Toast.jsx";
import UndoBar from "../components/UndoBar.jsx";
import PhotoAttach from "../components/PhotoAttach.jsx";
import PhotoViewer from "../components/PhotoViewer.jsx";
import ContactImportSheet, { ContactPermissionGuide } from "../components/ContactImportSheet.jsx";
import { toDateStr, formatKoreanDate } from "../utils/date.js";
import {
  newContact, genSubId, buildImportCandidates, buildSearchIndex, prepareSearchQuery, matchSearchIndex,
  getNextSolarOccurrence, daysUntil,
  CONTACT_EVERY_OPTIONS, contactEveryLabel, contactDue, lastContactDate, daysBetween, agoLabel,
  CONTACT_SORTS, sortContacts, renameContactTag, removeContactTag,
} from "../data/contacts.js";
import { parseVCards } from "../utils/vcard.js";
import { useBackClose } from "../utils/useBackClose.js";
import { useUndo, putBack } from "../utils/useUndo.js";
import { newDesignOn } from "../utils/todayLook.js";
import { canAutoFocus } from "../utils/device.js";
import { externalLinkClick } from "../utils/links.js";

const NL = () => newDesignOn(); // 새 디자인이면 작은 글씨를 13px 이상으로
// 새 디자인: 기능별 둥근 칸(boxCard)·글씨 기준(UI) — 예전 화면은 그대로 (CLAUDE.md 14.7)
const card = (extra) => ({ ...(NL() ? boxCard : S.card), ...extra });
const lbl = (mb = 6) => ({ fontSize: NL() ? 14 : 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: mb });
const bodyFs = () => (NL() ? 16 : 13);
const subFs = () => (NL() ? UI.sub + 1 : 12);
const linkBtn = () => ({ background: "none", border: "none", color: NL() ? UI.accent : "var(--dm-accent, #6C8EFF)", fontSize: NL() ? 14 : 12, fontWeight: 900, cursor: "pointer", padding: 0, fontFamily: "inherit" });

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 입력 검증용(윤년 여부는 신경쓰지 않고 넉넉하게 29일까지 허용)
const PAGE = 100; // 목록은 100줄씩 그린다 — 연락처 수천 명을 한 번에 그리면 휴대폰에서 몇 초 걸린다 (CLAUDE.md 15장)
const SORT_KEY = "dm_people_sort"; // 기기마다 (accountSwap DEVICE_KEYS)
const isTouch = () => !!window.matchMedia?.("(pointer: coarse)").matches;

function Header({ title, onBack, right }) {
  return (
    <div style={S.topbar}>
      <button className={NL() ? 'dm-hit' : undefined} onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--dm-text)", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0 }}>←</button>
      <div style={{ flex: 1, fontSize: 18, fontWeight: 900, marginLeft: 8, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      {right}
    </div>
  );
}

function TagPicker({ allTags, selected, onToggle, onAddTag }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim();
    if (v && !allTags.includes(v)) onAddTag(v);
    if (v && !selected.includes(v)) onToggle(v);
    setDraft(""); setAdding(false);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {allTags.map(t => (
        <button key={t} type="button" onClick={() => onToggle(t)} style={{ ...S.pill(selected.includes(t)), ...(NL() ? { fontSize: UI.sub } : {}) }}>{t}</button>
      ))}
      {adding ? (
        <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(""); setAdding(false); } }}
          placeholder="태그 이름" maxLength={12}
          style={{ ...S.input, width: 100, padding: "6px 10px", fontSize: NL() ? 14 : 12, marginBottom: 0 }} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ ...S.pill(false), borderStyle: "dashed" }}>＋ 태그</button>
      )}
    </div>
  );
}

// 연락 주기 고르기 — 안 정함·2주·1달·3달·6달·1년
function EveryPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {CONTACT_EVERY_OPTIONS.map(o => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} style={{ ...S.pill((Number(value) || 0) === o.v), ...(NL() ? { fontSize: UI.sub } : {}) }}>{o.l}</button>
      ))}
    </div>
  );
}
// 주기를 바꾼 날부터 센다 — 기록 없는 사람이 정하자마자 "연락할 때"로 뜨지 않게
const everyPatch = (v) => ({ contactEvery: v || 0, contactEverySince: v ? toDateStr() : null });

// ── 사람 등록/수정 폼 — 이름만 먼저, 나머지는 펼쳐서 채우는 방식 ──
function ContactForm({ draft, setDraft, allTags, onAddTag, contacts, uid, onCancel, onSave, onError }) {
  const [expanded, setExpanded] = useState(false);
  const set = (patch) => setDraft(prev => ({ ...prev, ...patch }));
  const bday = draft.birthday || { calendar: "solar", month: "", day: "", year: "" };
  const setBday = (patch) => set({ birthday: { ...bday, ...patch } });
  const maxDay = bday.month ? (MONTH_DAYS[Number(bday.month) - 1] || 31) : 31;

  const addAnniversary = () => set({ anniversaries: [...(draft.anniversaries || []), { id: genSubId("ann"), name: "", month: "", day: "", year: "" }] });
  const updateAnniversary = (id, patch) => set({ anniversaries: (draft.anniversaries || []).map(a => a.id === id ? { ...a, ...patch } : a) });
  const removeAnniversary = (id) => set({ anniversaries: (draft.anniversaries || []).filter(a => a.id !== id) });

  const addCard = () => set({ cards: [...(draft.cards || []), { id: genSubId("card"), frontUrl: null, frontPath: null, backUrl: null, backPath: null, addedAt: new Date().toISOString() }] });
  const updateCard = (id, patch) => set({ cards: (draft.cards || []).map(c => c.id === id ? { ...c, ...patch } : c) });
  const removeCard = (id) => set({ cards: (draft.cards || []).filter(c => c.id !== id) });

  const otherContacts = contacts.filter(c => c.id !== draft.id);

  return (
    <div style={{ padding: NL() ? 0 : "0 16px" }}>
      <div style={card({ margin: NL() ? `12px ${UI.gutter}px ${UI.box.gap}px` : "12px 0" })}>
        <div style={lbl()}>이름 *</div>
        {/* 휴대폰은 키보드가 화면을 가려서 자동 커서를 두지 않는다 (CLAUDE.md 14.7) */}
        <input autoFocus={canAutoFocus()} value={draft.name} onChange={e => set({ name: e.target.value })} placeholder="이름 (필수)" maxLength={30} style={S.input} />

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input value={draft.company} onChange={e => set({ company: e.target.value })} placeholder="회사" maxLength={40} style={{ ...S.input, marginBottom: 0 }} />
          <input value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="직책" maxLength={20} style={{ ...S.input, marginBottom: 0 }} />
        </div>

        <div style={{ ...lbl(), margin: "12px 0 6px" }}>관계 태그</div>
        <TagPicker allTags={allTags} selected={draft.tags || []} onAddTag={onAddTag}
          onToggle={(t) => set({ tags: (draft.tags || []).includes(t) ? draft.tags.filter(x => x !== t) : [...(draft.tags || []), t] })} />

        <div style={{ ...lbl(), margin: "12px 0 6px" }}>연락 주기 <span style={{ fontWeight: 400 }}>— 정하면 지났을 때 오늘 탭에서 챙겨 드려요</span></div>
        <EveryPicker value={draft.contactEvery} onChange={(v) => { if ((Number(draft.contactEvery) || 0) !== v) set(everyPatch(v)); }} />
      </div>

      <div style={{ padding: NL() ? `0 ${UI.gutter}px` : 0 }}>
        {!expanded && <button onClick={() => setExpanded(true)} style={{ ...S.btnGhost, marginTop: 0 }}>＋ 연락처·생일·메모 등 추가 정보 입력 ▾</button>}
      </div>
      {expanded && (
        <>
          <div style={card()}>
            <div style={lbl()}>연락처</div>
            <input value={draft.phone} onChange={e => set({ phone: e.target.value })} placeholder="전화번호" maxLength={20} style={S.input} />
            <input value={draft.email} onChange={e => set({ email: e.target.value })} placeholder="이메일" maxLength={60} style={{ ...S.input, marginBottom: 0 }} />
          </div>

          <div style={card()}>
            <div style={lbl(8)}>생일</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button type="button" onClick={() => setBday({ calendar: "solar" })} style={{ ...S.pill(bday.calendar !== "lunar"), flex: 1 }}>양력</button>
              <button type="button" onClick={() => setBday({ calendar: "lunar" })} style={{ ...S.pill(bday.calendar === "lunar"), flex: 1 }}>음력</button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min={1} max={12} value={bday.month} onChange={e => setBday({ month: e.target.value ? Number(e.target.value) : "" })} placeholder="월" style={{ ...S.input, marginBottom: 0 }} />
              <input type="number" min={1} max={maxDay} value={bday.day} onChange={e => setBday({ day: e.target.value ? Number(e.target.value) : "" })} placeholder="일" style={{ ...S.input, marginBottom: 0 }} />
              <input type="number" min={1900} max={2100} value={bday.year} onChange={e => setBday({ year: e.target.value ? Number(e.target.value) : "" })} placeholder="연도(선택)" style={{ ...S.input, marginBottom: 0 }} />
            </div>
            {bday.calendar === "lunar" && (
              <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginTop: 8, lineHeight: 1.5 }}>
                음력 날짜는 매년 양력으로 변환해 알려드려요. 윤달에 태어난 경우 평달로 계산되어 실제와 하루 이상 어긋날 수 있어요.
              </div>
            )}
          </div>

          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ ...lbl(0) }}>기타 기념일 (제사처럼 음력이면 "음력"을 눌러요)</div>
              <button type="button" onClick={addAnniversary} style={linkBtn()}>＋ 추가</button>
            </div>
            {(draft.anniversaries || []).map(a => (
              <div key={a.id} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                <input value={a.name} onChange={e => updateAnniversary(a.id, { name: e.target.value })} placeholder="이름 (예: 결혼기념일)" style={{ ...S.input, flex: 1.4, marginBottom: 0 }} />
                <input type="number" min={1} max={12} value={a.month} onChange={e => updateAnniversary(a.id, { month: e.target.value ? Number(e.target.value) : "" })} placeholder="월" style={{ ...S.input, flex: 1, marginBottom: 0 }} />
                <input type="number" min={1} max={31} value={a.day} onChange={e => updateAnniversary(a.id, { day: e.target.value ? Number(e.target.value) : "" })} placeholder="일" style={{ ...S.input, flex: 1, marginBottom: 0 }} />
                <button type="button" onClick={() => updateAnniversary(a.id, { calendar: a.calendar === "lunar" ? "solar" : "lunar" })} title="양력/음력 바꾸기"
                  style={{ flexShrink: 0, padding: "0 8px", height: 40, borderRadius: 10, border: `1.5px solid ${a.calendar === "lunar" ? "#8B5CF6" : "var(--dm-border)"}`, background: a.calendar === "lunar" ? "rgba(139,92,246,.12)" : "var(--dm-input)", color: a.calendar === "lunar" ? "#8B5CF6" : "var(--dm-sub)", fontSize: NL() ? 14 : 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{a.calendar === "lunar" ? "음력" : "양력"}</button>
                <button type="button" onClick={() => removeAnniversary(a.id)} style={{ background: "none", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer" }}>✕</button>
              </div>
            ))}
            {(draft.anniversaries || []).length === 0 && <div style={{ fontSize: NL() ? 14 : 12, color: "var(--dm-muted)" }}>등록된 기념일이 없어요</div>}
          </div>

          <div style={card()}>
            <div style={lbl(8)}>처음 만난 날 / 장소</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" value={draft.firstMet?.date || ""} onChange={e => set({ firstMet: { ...draft.firstMet, date: e.target.value } })} style={{ ...S.input, marginBottom: 0, flex: 1 }} />
              <input value={draft.firstMet?.place || ""} onChange={e => set({ firstMet: { ...draft.firstMet, place: e.target.value } })} placeholder="장소" style={{ ...S.input, marginBottom: 0, flex: 1 }} />
            </div>
          </div>

          <div style={card()}>
            <div style={lbl(8)}>소개해준 사람</div>
            <select
              value={draft.introducedBy?.personId || "__text__"}
              onChange={e => set({ introducedBy: e.target.value === "__text__" ? { personId: null, text: draft.introducedBy?.text || "" } : { personId: e.target.value, text: "" } })}
              style={{ ...S.input, marginBottom: draft.introducedBy?.personId ? 0 : 8 }}
            >
              <option value="__text__">직접 입력</option>
              {otherContacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!draft.introducedBy?.personId && (
              <input value={draft.introducedBy?.text || ""} onChange={e => set({ introducedBy: { personId: null, text: e.target.value } })} placeholder="예: 회사 동료 소개" style={{ ...S.input, marginBottom: 0 }} />
            )}
          </div>

          <div style={card()}>
            <div style={lbl(8)}>자유 메모</div>
            <textarea value={draft.memo} onChange={e => set({ memo: e.target.value })} placeholder="취미, 관심사, 좋아하는 음식, 기억할 점 등" rows={4}
              style={{ ...S.input, marginBottom: 0, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={lbl(0)}>명함 (앞면 · 뒷면)</div>
              {uid && <button type="button" onClick={addCard} style={linkBtn()}>＋ 명함 추가</button>}
            </div>
            {!uid && <div style={{ fontSize: NL() ? 14 : 12, color: "var(--dm-muted)" }}>로그인 후 명함 사진을 첨부할 수 있어요</div>}
            {(draft.cards || []).map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--dm-row)" }}>
                <div style={{ textAlign: "center" }}>
                  <PhotoAttach uid={uid} pathPrefix={`users/${uid}/contacts/${draft.id}`} size={64}
                    photoUrl={c.frontUrl} photoPath={c.frontPath}
                    onChange={(r) => updateCard(c.id, { frontUrl: r?.url || null, frontPath: r?.path || null })}
                    onError={onError} />
                  <div style={{ fontSize: NL() ? 13 : 10, color: "var(--dm-muted)", marginTop: 4 }}>앞면</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <PhotoAttach uid={uid} pathPrefix={`users/${uid}/contacts/${draft.id}`} size={64}
                    photoUrl={c.backUrl} photoPath={c.backPath}
                    onChange={(r) => updateCard(c.id, { backUrl: r?.url || null, backPath: r?.path || null })}
                    onError={onError} />
                  <div style={{ fontSize: NL() ? 13 : 10, color: "var(--dm-muted)", marginTop: 4 }}>뒷면</div>
                </div>
                <button type="button" onClick={() => removeCard(c.id)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer" }}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, margin: "4px 0 20px", padding: NL() ? `0 ${UI.gutter}px` : 0 }}>
        <button onClick={onCancel} style={{ ...S.btnGhost, flex: 1, marginTop: 0 }}>취소</button>
        <button onClick={onSave} disabled={!draft.name.trim()} style={{ ...S.btn, flex: 1, marginTop: 0, opacity: draft.name.trim() ? 1 : 0.5 }}>저장</button>
      </div>
    </div>
  );
}

function BirthdayLine({ birthday }) {
  if (!birthday?.month || !birthday?.day) return null;
  const label = `${birthday.calendar === "lunar" ? "음력 " : ""}${birthday.month}월 ${birthday.day}일${birthday.year ? ` (${birthday.year}년)` : ""}`;
  const occ = getNextSolarOccurrence(birthday.month, birthday.day, birthday.calendar || "solar");
  const dday = occ ? daysUntil(occ) : null;
  return (
    <div style={{ fontSize: bodyFs(), color: "var(--dm-text)" }}>
      🎂 {label}
      {dday != null && <span style={{ color: "var(--dm-accent, #6C8EFF)", fontWeight: 900, marginLeft: 6 }}>{dday === 0 ? "오늘!" : `D-${dday}`}</span>}
    </div>
  );
}

// 전화·문자·메일 버튼 — 문자는 휴대폰에서만(PC엔 문자 앱이 없다). 데스크탑 앱은 기본 프로그램으로 연다
function ContactActions({ contact }) {
  const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, flex: 1, minHeight: NL() ? UI.touch : 36, borderRadius: 12, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: NL() ? UI.accent : "var(--dm-accent, #6C8EFF)", fontSize: NL() ? 15 : 13, fontWeight: 800, textDecoration: "none", fontFamily: "inherit" };
  const items = [];
  if (contact.phone) {
    const tel = `tel:${contact.phone}`;
    items.push(<a key="tel" href={tel} onClick={externalLinkClick(tel)} style={btn}>📞 전화</a>);
    if (isTouch()) items.push(<a key="sms" href={`sms:${contact.phone}`} style={btn}>💬 문자</a>);
  }
  if (contact.email) {
    const mail = `mailto:${contact.email}`;
    items.push(<a key="mail" href={mail} onClick={externalLinkClick(mail)} style={btn}>✉️ 메일</a>);
  }
  if (!items.length) return null;
  return <div style={{ display: "flex", gap: 8, marginTop: 10 }}>{items}</div>;
}

// ── 사람 상세 화면 ──
function ContactDetail({ contact, plans, onBack, onEdit, onDelete, onUpdate, onAddMeeting, onEditMeeting, onDeleteMeeting, onContactedToday, onAddFollowupTask, onToggleTaskForDate, onOpenDate, contacts }) {
  const [meetingDate, setMeetingDate] = useState(toDateStr());
  const [meetingNote, setMeetingNote] = useState("");
  const [addingFollowup, setAddingFollowup] = useState(null); // meetingId | null
  const [followupTitle, setFollowupTitle] = useState("");
  const [followupDate, setFollowupDate] = useState(toDateStr());
  const [editing, setEditing] = useState(null); // { id, date, note } — 만남 기록 고치기
  const [viewer, setViewer] = useState(null); // 명함 크게 보기 시작 번호

  const introducedByName = contact.introducedBy?.personId
    ? contacts.find(c => c.id === contact.introducedBy.personId)?.name
    : contact.introducedBy?.text;

  const submitMeeting = () => {
    if (!meetingNote.trim()) return;
    onAddMeeting({ id: genSubId("mt"), date: meetingDate, note: meetingNote.trim(), createdAt: new Date().toISOString() });
    setMeetingNote("");
  };
  const saveEdit = () => {
    if (!editing?.note.trim()) return;
    onEditMeeting(editing.id, { date: editing.date || toDateStr(), note: editing.note.trim() });
    setEditing(null);
  };

  // 후속 할 일 자체는 onAddFollowupTask(App.jsx) 한 곳에서만 만들고 contact.linkedTasks에 포인터를 남긴다.
  // 예전엔 meeting별로도 별도 linkedTasks를 관리했는데, 같은 클릭 안에서 두 군데를 각각
  // setContacts로 갱신하다 보니 나중 호출이 stale한 contact 스냅샷으로 덮어써 방금 만든
  // 연결이 사라지는 경합이 있었음 — 소스를 하나로 합쳐서 해결.
  const submitFollowup = () => {
    if (!followupTitle.trim()) return;
    onAddFollowupTask(followupDate, followupTitle.trim());
    setFollowupTitle(""); setAddingFollowup(null);
  };

  const today = toDateStr();
  const last = lastContactDate(contact, today);
  const due = contactDue(contact, today);
  const cardPhotos = (contact.cards || []).slice().reverse().flatMap(c => [
    c.frontUrl && { url: c.frontUrl, caption: "명함 앞면" },
    c.backUrl && { url: c.backUrl, caption: "명함 뒷면" },
  ]).filter(Boolean);
  // 날짜 최신순으로 보여 준다 (예전엔 넣은 순서를 뒤집기만 해서 지난 날짜로 넣은 기록이 맨 위에 왔다)
  const meetings = (contact.meetings || []).map((m, i) => ({ m, i })).sort((a, b) => (a.m.date === b.m.date ? b.i - a.i : (a.m.date < b.m.date ? 1 : -1))).map(x => x.m);

  return (
    <div style={S.content}>
      <Header title={contact.name} onBack={onBack} right={
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button className={NL() ? 'dm-hit' : undefined} onClick={onEdit} style={{ background: "none", border: "none", color: "var(--dm-accent, #6C8EFF)", fontSize: NL() ? 15 : 13, fontWeight: 900, cursor: "pointer" }}>수정</button>
          <button className={NL() ? 'dm-hit' : undefined} onClick={onDelete} style={{ background: "none", border: "none", color: "#F87171", fontSize: NL() ? 15 : 13, fontWeight: 900, cursor: "pointer" }}>삭제</button>
        </div>
      } />

      {(contact.company || contact.title || contact.phone || contact.email || (contact.tags || []).length > 0) && (
        <div style={card()}>
          {(contact.company || contact.title) && <div style={{ fontSize: bodyFs(), color: "var(--dm-sub)", marginBottom: 4 }}>{[contact.company, contact.title].filter(Boolean).join(" · ")}</div>}
          {contact.phone && <div style={{ fontSize: bodyFs(), color: "var(--dm-text)" }}>{contact.phone}</div>}
          {contact.email && <div style={{ fontSize: bodyFs(), color: "var(--dm-text)", wordBreak: "break-all" }}>{contact.email}</div>}
          {(contact.tags || []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {contact.tags.map(t => <span key={t} style={{ ...S.pill(true), ...(NL() ? { fontSize: UI.sub } : {}) }}>{t}</span>)}
            </div>
          )}
          <ContactActions contact={contact} />
        </div>
      )}

      {/* 연락 — 마지막 연락·주기·오늘 연락했어요 (2026-11-09) */}
      <div style={card()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: bodyFs(), color: "var(--dm-text)", minWidth: 0 }}>
            📞 마지막 연락 <b>{last ? `${agoLabel(daysBetween(last, today))}` : "기록 없음"}</b>
            {last && <div style={{ color: "var(--dm-muted)", fontSize: subFs(), marginTop: 2 }}>{formatKoreanDate(last)}</div>}
          </div>
          {due?.due && <span style={{ flexShrink: 0, fontSize: NL() ? 13 : 11, fontWeight: 900, color: "#EC4899", background: "rgba(236,72,153,.12)", borderRadius: 999, padding: "3px 9px" }}>연락할 때</span>}
        </div>
        <div style={{ ...lbl(6), marginTop: 4 }}>연락 주기{due && !due.due ? <span style={{ fontWeight: 400 }}> · {due.dueIn}일 뒤 챙겨 드려요</span> : null}</div>
        <EveryPicker value={contact.contactEvery} onChange={(v) => { if ((Number(contact.contactEvery) || 0) !== v) onUpdate(everyPatch(v)); }} />
        <button onClick={onContactedToday} disabled={last === today}
          style={{ ...S.btnGhost, marginTop: 10, opacity: last === today ? 0.5 : 1, ...(NL() ? { minHeight: UI.touch, fontSize: 15 } : {}) }}>
          {last === today ? "✓ 오늘 연락했어요" : "✓ 오늘 연락했어요 (기록 없이)"}
        </button>
      </div>

      {(contact.birthday || (contact.anniversaries || []).length > 0) && (
        <div style={card()}>
          <BirthdayLine birthday={contact.birthday} />
          {(contact.anniversaries || []).map(a => a.month && a.day && (
            <div key={a.id} style={{ fontSize: bodyFs(), color: "var(--dm-text)", marginTop: 4 }}>
              📌 {a.name || "기념일"} · {a.calendar === "lunar" ? "음력 " : ""}{a.month}월 {a.day}일
            </div>
          ))}
        </div>
      )}

      {(contact.firstMet?.date || contact.firstMet?.place || introducedByName) && (
        <div style={card()}>
          {(contact.firstMet?.date || contact.firstMet?.place) && (
            <div style={{ fontSize: bodyFs(), color: "var(--dm-text)" }}>👋 처음 만남: {contact.firstMet?.date ? formatKoreanDate(contact.firstMet.date) : ""} {contact.firstMet?.place}</div>
          )}
          {introducedByName && <div style={{ fontSize: bodyFs(), color: "var(--dm-text)", marginTop: 4 }}>🔗 소개: {introducedByName}</div>}
        </div>
      )}

      {contact.memo && (
        <div style={card()}>
          <div style={lbl()}>메모</div>
          <div style={{ fontSize: bodyFs(), color: "var(--dm-text)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{contact.memo}</div>
        </div>
      )}

      {cardPhotos.length > 0 && (
        <div style={card()}>
          <div style={lbl(8)}>명함 {contact.cards.length > 1 ? `(최근 ${contact.cards.length}장)` : ""} <span style={{ fontWeight: 400 }}>· 누르면 크게</span></div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
            {cardPhotos.map((p, i) => (
              <button key={i} onClick={() => setViewer(i)} style={{ padding: 0, border: "none", background: "none", cursor: "zoom-in", flexShrink: 0 }}>
                <img src={p.url} alt={p.caption} style={{ display: "block", width: 120, height: 76, objectFit: "cover", borderRadius: 8, border: "1px solid var(--dm-border)" }} />
              </button>
            ))}
          </div>
        </div>
      )}
      {viewer != null && <PhotoViewer photos={cardPhotos} index={viewer} onClose={() => setViewer(null)} />}

      {(contact.linkedTasks || []).length > 0 && (
        <div style={card()}>
          <div style={lbl(8)}>연결된 할 일</div>
          {contact.linkedTasks.map(lt => {
            const liveTask = (plans[lt.date]?.tasks || []).find(t => t.id === lt.taskId);
            const done = liveTask ? liveTask.done : false;
            const title = liveTask ? liveTask.title : lt.title;
            return (
              <button key={lt.taskId} onClick={() => onOpenDate(lt.date)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", padding: "6px 0", cursor: "pointer", textAlign: "left" }}>
                <span onClick={(e) => { e.stopPropagation(); onToggleTaskForDate(lt.date, lt.taskId); }} style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${done ? "rgba(74,222,128,.5)" : "var(--dm-border)"}`, background: done ? "rgba(74,222,128,.15)" : "var(--dm-input)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: NL() ? 13 : 11, color: "#4ADE80" }}>{done ? "✓" : ""}</span>
                <span style={{ flex: 1, fontSize: bodyFs(), color: done ? "var(--dm-muted)" : "var(--dm-text)", textDecoration: done ? "line-through" : "none" }}>{title}</span>
                <span style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)" }}>{formatKoreanDate(lt.date)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={card()}>
        <div style={lbl(8)}>만남 기록 {meetings.length > 0 && <span style={{ fontWeight: 400 }}>· 누르면 고치기</span>}</div>
        {meetings.map(m => (
          <div key={m.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--dm-row)" }}>
            {editing?.id === m.id ? (
              <div>
                <input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} style={{ ...S.input, marginBottom: 6 }} />
                <textarea value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} rows={4}
                  style={{ ...S.input, marginBottom: 6, resize: "vertical", fontFamily: "inherit" }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setEditing(null); onDeleteMeeting(m.id); }} style={{ ...S.btnGhost, flex: 1, marginTop: 0, color: "#F87171" }}>삭제</button>
                  <button onClick={() => setEditing(null)} style={{ ...S.btnGhost, flex: 1, marginTop: 0 }}>취소</button>
                  <button onClick={saveEdit} disabled={!editing.note.trim()} style={{ ...S.btn, flex: 1, marginTop: 0, opacity: editing.note.trim() ? 1 : 0.5 }}>저장</button>
                </div>
              </div>
            ) : (
              <div onClick={() => setEditing({ id: m.id, date: m.date || toDateStr(), note: m.note || "" })} style={{ cursor: "pointer" }}>
                <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginBottom: 3 }}>{formatKoreanDate(m.date)}</div>
                <div style={{ fontSize: bodyFs(), color: "var(--dm-text)", whiteSpace: "pre-wrap" }}>{m.note}</div>
              </div>
            )}
            {editing?.id !== m.id && (addingFollowup === m.id ? (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input value={followupTitle} onChange={e => setFollowupTitle(e.target.value)} placeholder="할 일 제목" style={{ ...S.input, flex: 1.5, marginBottom: 0, fontSize: NL() ? 14 : 12, padding: "8px 10px" }} />
                <input type="date" value={followupDate} onChange={e => setFollowupDate(e.target.value)} style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: NL() ? 14 : 12, padding: "8px 10px" }} />
                <button onClick={submitFollowup} style={{ background: "var(--dm-accent, #6C8EFF)", border: "none", borderRadius: 8, color: "#fff", fontSize: NL() ? 14 : 12, fontWeight: 900, padding: "0 10px", cursor: "pointer" }}>추가</button>
              </div>
            ) : (
              <button onClick={() => { setAddingFollowup(m.id); setFollowupTitle(""); setFollowupDate(toDateStr()); }} style={{ ...linkBtn(), marginTop: 6, fontWeight: 700 }}>＋ 할 일 추가</button>
            ))}
          </div>
        ))}
        {meetings.length === 0 && <div style={{ fontSize: NL() ? 14 : 12, color: "var(--dm-muted)", marginBottom: 10 }}>아직 기록이 없어요</div>}

        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} style={{ ...S.input, flex: 1, marginBottom: 0 }} />
        </div>
        <textarea value={meetingNote} onChange={e => setMeetingNote(e.target.value)} placeholder="만남 내용을 적어보세요 (예: 점심 식사, 등산을 좋아한다고 함)" rows={10}
          style={{ ...S.input, marginTop: 6, marginBottom: 0, resize: "vertical", fontFamily: "inherit" }} />
        <button onClick={submitMeeting} disabled={!meetingNote.trim()} style={{ ...S.btn, marginTop: 8, opacity: meetingNote.trim() ? 1 : 0.5 }}>기록 저장</button>
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

// 태그 관리 — 이름 바꾸기(같은 이름이 있으면 합침)·지우기 (2026-11-09)
function TagManager({ tags, contacts, onRename, onRemove }) {
  const [editing, setEditing] = useState(null); // { from, to }
  const count = (t) => contacts.filter(c => (c.tags || []).includes(t)).length;
  const commit = () => {
    if (editing && editing.to.trim() && editing.to.trim() !== editing.from) onRename(editing.from, editing.to.trim());
    setEditing(null);
  };
  return (
    <div style={card({ margin: "8px 0 0" })}>
      {tags.length === 0 && <div style={{ fontSize: subFs(), color: "var(--dm-muted)" }}>태그가 없어요. 사람을 추가할 때 "＋ 태그"로 만들어요</div>}
      {tags.map(t => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--dm-row)" }}>
          {editing?.from === t ? (
            <input autoFocus value={editing.to} maxLength={12} onChange={e => setEditing({ ...editing, to: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(null); }}
              style={{ ...S.input, flex: 1, marginBottom: 0, padding: "6px 10px" }} />
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontSize: bodyFs(), color: "var(--dm-text)" }}>{t} <span style={{ color: "var(--dm-muted)", fontSize: subFs() }}>{count(t)}명</span></span>
          )}
          {editing?.from === t ? (
            <>
              <button onClick={() => setEditing(null)} style={{ ...linkBtn(), color: "var(--dm-muted)" }}>취소</button>
              <button onClick={commit} style={linkBtn()}>저장</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing({ from: t, to: t })} style={linkBtn()}>이름 바꾸기</button>
              <button onClick={() => onRemove(t)} aria-label={`${t} 태그 지우기`} style={{ background: "none", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>✕</button>
            </>
          )}
        </div>
      ))}
      <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginTop: 8, lineHeight: 1.5 }}>
        이름을 바꾸거나 지우면 그 태그가 붙은 사람들에게도 함께 적용돼요. 이미 있는 이름으로 바꾸면 하나로 합쳐져요.
      </div>
    </div>
  );
}

// 연락처 파일(.vcf) 가져오기 안내 — 아이폰·삼성 인터넷처럼 연락처 선택 창이 없는 기기용
function VcfGuide({ onPick, onClose }) {
  useBackClose(onClose);
  const portalTarget = document.querySelector('.dm-phone') || document.body;
  const p = { fontSize: 14, color: 'var(--dm-text)', lineHeight: 1.6, marginBottom: 10 };
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 310, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, background: 'var(--dm-bg)', borderRadius: 18, border: '1px solid var(--dm-border)', padding: '20px 20px 16px', boxShadow: '0 12px 40px rgba(0,0,0,.4)' }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 10 }}>📇 연락처 파일로 가져오기</div>
        <div style={p}><b>아이폰</b> — 연락처 앱 → 왼쪽 위 <b>목록</b> → 목록(예: 모든 연락처)을 길게 누르기 → <b>내보내기</b> → 파일에 저장. 한 사람만이면 그 사람 화면 → <b>연락처 공유</b>.</div>
        <div style={p}><b>안드로이드</b> — 연락처 앱 → 메뉴 → <b>연락처 관리 → 연락처 가져오기/내보내기 → 내보내기</b>.</div>
        <div style={{ fontSize: 13, color: 'var(--dm-muted)', lineHeight: 1.5, margin: '4px 0 14px' }}>
          파일은 이 기기 안에서만 읽고 다른 곳으로 보내지 않아요. 다음 화면에서 등록할 사람만 골라요.
        </div>
        <button onClick={onPick} style={{ ...S.btn, marginBottom: 8 }}>파일 고르기</button>
        <button onClick={onClose} style={{ ...S.btnGhost, marginTop: 0 }}>취소</button>
      </div>
    </div>,
    portalTarget
  );
}

export default function People({
  contacts, onUpsertContact, onDeleteContact,
  contactTags, setContactTags,
  contactAlarmCfg, setContactAlarmCfg,
  plans, onAddFollowupTask, onToggleTaskForDate, onOpenDate,
  authUser, toast, setToast, onBack,
  initialId, onInitialOpened,
}) {
  // 오늘 탭 "오늘 챙길 사람" 줄에서 들어오면 그 사람 상세부터
  const [view, setView] = useState(() => (initialId && contacts.some(c => c.id === initialId) ? "detail" : "list")); // list | detail | form
  const [selectedId, setSelectedId] = useState(() => (initialId && contacts.some(c => c.id === initialId) ? initialId : null));
  useEffect(() => { if (initialId) onInitialOpened?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useBackClose(() => setView("list"), view !== "list");
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [tagFilters, setTagFilters] = useState([]);
  const [dueOnly, setDueOnly] = useState(false);
  const [showAlarmSettings, setShowAlarmSettings] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [sort, setSortState] = useState(() => { try { return localStorage.getItem(SORT_KEY) || "added"; } catch { return "added"; } });
  const [more, setMore] = useState({ key: "", n: PAGE }); // "더 보기" — 검색·거르기·순서가 바뀌면 다시 100줄부터
  const { bar: undoBar, offer: offerUndo, run: runUndo } = useUndo();
  // 되돌리기는 5초 뒤에 부를 수 있어 그때의 최신 목록을 쓴다
  const contactsRef = useRef(contacts);
  const tagsRef = useRef(contactTags);
  useEffect(() => { contactsRef.current = contacts; tagsRef.current = contactTags; }, [contacts, contactTags]);

  const uid = authUser?.uid;
  const selected = contacts.find(c => c.id === selectedId) || null;
  const today = toDateStr();

  // 검색 정보는 목록이 바뀔 때만 계산하고, 입력은 목록 갱신과 분리한다 (예전엔 글자마다 모든 사람의 초성을 다시 계산)
  const indexed = useMemo(() => contacts.map(c => ({ c, idx: buildSearchIndex(c) })), [contacts]);
  const deferredQuery = useDeferredValue(query);
  const dueIds = useMemo(() => new Set(contacts.filter(c => contactDue(c, today)?.due).map(c => c.id)), [contacts, today]);
  const filtered = useMemo(() => {
    const pq = prepareSearchQuery(deferredQuery);
    const list = indexed.filter(x => matchSearchIndex(x.idx, pq)).map(x => x.c)
      .filter(c => tagFilters.length === 0 || tagFilters.some(t => (c.tags || []).includes(t)))
      .filter(c => !dueOnly || dueIds.has(c.id));
    return sortContacts(list, sort, today);
  }, [indexed, deferredQuery, tagFilters, dueOnly, dueIds, sort, today]);
  const listKey = `${deferredQuery}|${tagFilters.join(",")}|${dueOnly}|${sort}`;
  const limit = more.key === listKey ? more.n : PAGE;
  const shown = filtered.slice(0, limit);

  const setSort = (v) => { setSortState(v); try { localStorage.setItem(SORT_KEY, v); } catch { /* 저장 못 해도 이번엔 적용 */ } };
  const startAdd = () => { setDraft(newContact("")); setView("form"); };

  // 휴대폰 연락처에서 가져오기 (Contact Picker API — 안드로이드 크롬·설치형 앱 지원, 아이폰 미지원)
  // 운영체제의 연락처 선택 창에서 사용자가 직접 고른 사람만 앱에 전달됨 (주소록 전체를 읽지 않음)
  const [importCandidates, setImportCandidates] = useState(null);
  // 연락처 권한 안내: 'before' = 선택 창 열기 전 안내(첫 성공 전까지), 'empty' = 아무것도 안 넘어왔을 때 설정 안내
  // (크롬의 "연락처 접근 허용" 창은 크롬이 처음 한 번만 띄우고, 거부했으면 웹에서 다시 띄우거나 설정 화면을 열 수 없음)
  const [importGuide, setImportGuide] = useState(null);
  const [vcfGuide, setVcfGuide] = useState(false);
  const fileRef = useRef(null);
  const pickerSupported = typeof navigator !== "undefined" && "contacts" in navigator && typeof navigator.contacts?.select === "function";
  const startImport = () => {
    if (!pickerSupported) { setVcfGuide(true); return; }
    let everSucceeded = false;
    try { everSucceeded = localStorage.getItem("dm_contact_import_ok") === "1"; } catch { /* 저장소 접근 불가 시 안내 표시 */ }
    if (everSucceeded) openPicker();
    else setImportGuide("before");
  };
  // 버튼 누름(사용자 동작) 안에서 바로 호출해야 선택 창이 열림
  const openPicker = async () => {
    setImportGuide(null);
    try {
      // 이름·전화만 요청 — 이메일까지 요청하면 연락처가 많을 때 선택 창이 더 늦게 뜸 (이메일은 필요 시 직접 입력)
      const picked = await navigator.contacts.select(["name", "tel"], { multiple: true });
      // 권한이 없거나, 선택 창에서 검색 후 엔터를 눌러 아무 선택 없이 닫힌 경우
      if (!picked?.length) { setImportGuide("empty"); return; }
      const candidates = buildImportCandidates(picked, contacts);
      if (!candidates.length) { setToast?.("가져올 수 있는 연락처가 없어요"); return; }
      try { localStorage.setItem("dm_contact_import_ok", "1"); } catch { /* 무시 */ }
      setImportCandidates(candidates);
    } catch {
      setImportGuide("empty");
    }
  };
  // .vcf 파일 — 이 기기 안에서만 읽는다
  const pickVcf = () => { setVcfGuide(false); fileRef.current?.click(); };
  const onVcfFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 고를 수 있게
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) { setToast?.("파일이 너무 커요 (30MB까지)"); return; }
    try {
      const cards = parseVCards(await file.text());
      const candidates = buildImportCandidates(cards, contacts);
      if (!candidates.length) { setToast?.("파일에서 연락처를 찾지 못했어요. .vcf 연락처 파일인지 확인해 주세요"); return; }
      setImportCandidates(candidates);
    } catch {
      setToast?.("파일을 읽지 못했어요");
    }
  };
  const finishImport = (chosen, tags) => {
    chosen.forEach(x => onUpsertContact({
      ...newContact(x.name), phone: x.phone, email: x.email, tags: [...tags],
      ...(x.company ? { company: x.company } : {}), ...(x.title ? { title: x.title } : {}), ...(x.birthday ? { birthday: x.birthday } : {}),
    }));
    setImportCandidates(null);
    setToast?.(`${chosen.length}명을 내 사람들에 추가했어요 ✅`);
  };
  const startEdit = (c) => { setDraft({ ...c, birthday: c.birthday || { calendar: "solar", month: "", day: "", year: "" } }); setView("form"); };

  const saveDraft = () => {
    if (!draft.name.trim()) return;
    const clean = {
      ...draft,
      birthday: draft.birthday?.month && draft.birthday?.day ? draft.birthday : null,
      anniversaries: (draft.anniversaries || []).filter(a => a.month && a.day),
    };
    onUpsertContact(clean);
    setSelectedId(clean.id);
    setDraft(null);
    setView("detail");
    setToast?.("저장했어요 ✅");
  };

  // 연락처 삭제는 확인창 유지 (CLAUDE.md 14.1 — 명함 사진 파일도 함께 지워져 되돌릴 수 없다)
  const handleDelete = () => {
    if (!selected) return;
    if (!window.confirm(`${selected.name}님을 삭제할까요? 연결된 할 일은 그대로 남고, 이 사람과의 연결만 해제돼요.`)) return;
    onDeleteContact(selected.id);
    setView("list");
    setSelectedId(null);
    setToast?.("삭제했어요");
  };

  const latest = (id) => contactsRef.current.find(c => c.id === id);
  const updateSelected = (patch) => { if (selected) onUpsertContact({ ...selected, ...patch }); };
  const handleAddMeeting = (meetingObj) => {
    if (!selected) return;
    onUpsertContact({ ...selected, meetings: [...(selected.meetings || []), meetingObj] });
  };
  const handleEditMeeting = (meetingId, patch) => {
    if (!selected) return;
    onUpsertContact({ ...selected, meetings: (selected.meetings || []).map(m => m.id === meetingId ? { ...m, ...patch, editedAt: new Date().toISOString() } : m) });
    setToast?.("고쳤어요 ✅");
  };
  const handleDeleteMeeting = (meetingId) => {
    if (!selected) return;
    const id = selected.id;
    const list = selected.meetings || [];
    const idx = list.findIndex(m => m.id === meetingId);
    if (idx < 0) return;
    const removed = list[idx];
    onUpsertContact({ ...selected, meetings: list.filter(m => m.id !== meetingId) });
    offerUndo("만남 기록을 지웠어요", () => {
      const cur = latest(id);
      if (cur) onUpsertContact({ ...cur, meetings: putBack(cur.meetings, removed, idx) });
    });
  };
  const handleContactedToday = () => {
    if (!selected) return;
    const id = selected.id;
    const prev = selected.lastContactAt ?? null;
    onUpsertContact({ ...selected, lastContactAt: toDateStr() });
    offerUndo("오늘 연락했다고 남겼어요", () => {
      const cur = latest(id);
      if (cur) onUpsertContact({ ...cur, lastContactAt: prev });
    });
  };

  // 태그 이름 바꾸기·지우기 — 그 태그가 붙은 사람만 다시 저장
  const handleRenameTag = (from, to) => {
    const { tags, changed } = renameContactTag(contacts, contactTags, from, to);
    setContactTags(tags);
    changed.forEach(c => onUpsertContact(c));
    setTagFilters(prev => [...new Set(prev.map(t => (t === from ? to : t)))]);
    setToast?.(`"${from}" → "${to}" ${changed.length}명에 적용했어요`);
  };
  const handleRemoveTag = (tag) => {
    const tagIdx = contactTags.indexOf(tag);
    const { tags, changed } = removeContactTag(contacts, contactTags, tag);
    const ids = changed.map(c => c.id);
    setContactTags(tags);
    changed.forEach(c => onUpsertContact(c));
    setTagFilters(prev => prev.filter(t => t !== tag));
    offerUndo(`"${tag}" 태그를 지웠어요${ids.length ? ` (${ids.length}명)` : ""}`, () => {
      const curTags = tagsRef.current;
      if (!curTags.includes(tag)) { const next = [...curTags]; next.splice(Math.max(0, Math.min(tagIdx, next.length)), 0, tag); setContactTags(next); }
      ids.forEach(id => { const cur = latest(id); if (cur && !(cur.tags || []).includes(tag)) onUpsertContact({ ...cur, tags: [...(cur.tags || []), tag] }); });
    });
  };

  const undo = <UndoBar bar={undoBar} onUndo={runUndo} />;

  if (view === "form" && draft) {
    return (
      <div style={S.content}>
        {toast && <Toast msg={toast} onDone={() => setToast("")} />}
        <Header title={contacts.some(c => c.id === draft.id) ? "사람 수정" : "사람 추가"} onBack={() => setView(contacts.some(c => c.id === draft.id) ? "detail" : "list")} />
        <ContactForm draft={draft} setDraft={setDraft} allTags={contactTags} onAddTag={(t) => setContactTags([...contactTags, t])}
          contacts={contacts} uid={uid} onCancel={() => setView(contacts.some(c => c.id === draft.id) ? "detail" : "list")} onSave={saveDraft}
          onError={(msg) => setToast?.(msg)} />
      </div>
    );
  }

  if (view === "detail" && selected) {
    return (
      <>
        {toast && <Toast msg={toast} onDone={() => setToast("")} />}
        <ContactDetail contact={selected} plans={plans} contacts={contacts}
          onBack={() => { setView("list"); setSelectedId(null); }}
          onEdit={() => startEdit(selected)}
          onDelete={handleDelete}
          onUpdate={updateSelected}
          onAddMeeting={handleAddMeeting}
          onEditMeeting={handleEditMeeting}
          onDeleteMeeting={handleDeleteMeeting}
          onContactedToday={handleContactedToday}
          onAddFollowupTask={(date, title) => onAddFollowupTask(selected.id, date, title)}
          onToggleTaskForDate={onToggleTaskForDate}
          onOpenDate={onOpenDate}
        />
        {undo}
      </>
    );
  }

  const chip = (on) => ({ ...S.pill(on), ...(NL() ? { fontSize: UI.sub } : {}) });
  const toggleLink = (open) => ({ background: "none", border: "none", color: "var(--dm-muted)", fontSize: NL() ? 14 : 12, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit", ...(open ? { color: "var(--dm-text)" } : {}) });

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <Header title="내 사람들" onBack={onBack} right={contacts.length > 0 ? <span style={{ fontSize: NL() ? 14 : 12, color: "var(--dm-muted)", flexShrink: 0 }}>{contacts.length}명</span> : null} />

      <div style={{ padding: "12px 16px 0" }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름·초성·전화번호·회사·태그 검색" style={{ ...S.input, marginBottom: 8 }} />
        {pickerSupported && (
          <div style={{ fontSize: NL() ? 13 : 11, color: 'var(--dm-muted)', lineHeight: 1.5, marginBottom: 8 }}>
            💡 아래 "📱 연락처에서"를 누른 뒤 선택 창 맨 위 <b>모두 선택</b>을 누르면, 전체 연락처를 여기서 검색하며 골라 등록할 수 있어요
          </div>
        )}
        {(contactTags.length > 0 || dueIds.size > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {dueIds.size > 0 && (
              <button className={NL() ? 'dm-hit' : undefined} onClick={() => setDueOnly(v => !v)}
                style={{ ...chip(dueOnly), ...(dueOnly ? {} : { color: "#EC4899", borderColor: "rgba(236,72,153,.45)" }) }}>📞 연락할 때 {dueIds.size}</button>
            )}
            {contactTags.map(t => (
              <button className={NL() ? 'dm-hit' : undefined} key={t} onClick={() => setTagFilters(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} style={chip(tagFilters.includes(t))}>{t}</button>
            ))}
          </div>
        )}
        {/* 목록 순서 — 기기마다 기억 */}
        {contacts.length > 1 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 4, paddingBottom: 2 }}>
            {CONTACT_SORTS.map(o => (
              <button key={o.v} className={NL() ? 'dm-hit' : undefined} onClick={() => setSort(o.v)} style={{ ...chip(sort === o.v), flexShrink: 0, whiteSpace: "nowrap" }}>{sort === o.v ? "✓ " : ""}{o.l}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "0 16px 8px", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <button className={NL() ? 'dm-hit' : undefined} onClick={() => setShowAlarmSettings(v => !v)} style={toggleLink(showAlarmSettings)}>
          🔔 생일 알림 설정 {showAlarmSettings ? "▲" : "▼"}
        </button>
        <button className={NL() ? 'dm-hit' : undefined} onClick={() => setShowTagManager(v => !v)} style={toggleLink(showTagManager)}>
          🏷 태그 관리 {showTagManager ? "▲" : "▼"}
        </button>
        {pickerSupported && (
          <button className={NL() ? 'dm-hit' : undefined} onClick={() => setVcfGuide(true)} style={toggleLink(false)}>📇 파일로 가져오기</button>
        )}
      </div>
      <div style={{ padding: "0 16px" }}>
        {showAlarmSettings && (
          <div style={card({ margin: "0 0 8px" })}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: bodyFs(), fontWeight: 700 }}>생일·기념일 알림</span>
              <button onClick={() => setContactAlarmCfg({ ...contactAlarmCfg, enabled: !contactAlarmCfg.enabled })}
                style={{ width: 44, height: 24, borderRadius: 999, background: contactAlarmCfg.enabled ? "var(--dm-accent, #6C8EFF)" : "var(--dm-border)", border: "none", position: "relative", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                <span style={{ position: "absolute", top: 3, left: contactAlarmCfg.enabled ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
              </button>
            </div>
            {contactAlarmCfg.enabled && (
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {[{ v: 0, l: "당일" }, { v: 3, l: "3일 전" }, { v: 7, l: "7일 전" }].map(opt => {
                  const on = (contactAlarmCfg.offsets || []).includes(opt.v);
                  return (
                    <button key={opt.v} onClick={() => setContactAlarmCfg({ ...contactAlarmCfg, offsets: on ? contactAlarmCfg.offsets.filter(v => v !== opt.v) : [...(contactAlarmCfg.offsets || []), opt.v] })}
                      style={chip(on)}>{opt.l}</button>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginTop: 10, lineHeight: 1.5 }}>
              현재는 홈 화면 "오늘 챙길 사람" 영역에만 표시돼요. 앱을 닫아도 오는 알림(푸시·텔레그램) 연동은 다음 단계에서 진행할 예정이에요.
            </div>
          </div>
        )}
        {showTagManager && (
          <div style={{ marginBottom: 8 }}>
            <TagManager tags={contactTags} contacts={contacts} onRename={handleRenameTag} onRemove={handleRemoveTag} />
          </div>
        )}
      </div>

      <div style={{ padding: "8px 16px 0" }}>
        {shown.map(c => {
          const d = contactDue(c, today);
          const last = d ? d.last : lastContactDate(c, today);
          const lastLine = last ? `마지막 연락 ${agoLabel(daysBetween(last, today))}` : "";
          const everyLine = d ? `${contactEveryLabel(d.every)}마다` : "";
          const meta = [lastLine, everyLine].filter(Boolean).join(" · ");
          return (
            <button key={c.id} onClick={() => { setSelectedId(c.id); setView("detail"); }}
              style={{ width: "100%", textAlign: "left", background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: NL() ? UI.box.radius - 4 : 14, padding: NL() ? "13px 14px" : "12px 14px", marginBottom: 8, cursor: "pointer", fontFamily: "inherit", display: "block" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: NL() ? UI.body : 14, fontWeight: 900, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                {d?.due && <span style={{ flexShrink: 0, fontSize: NL() ? 13 : 10, fontWeight: 900, color: "#EC4899", background: "rgba(236,72,153,.12)", borderRadius: 999, padding: "2px 8px" }}>연락할 때</span>}
              </div>
              {(c.company || c.title) && <div style={{ fontSize: subFs(), color: "var(--dm-sub)", marginTop: 2 }}>{[c.company, c.title].filter(Boolean).join(" · ")}</div>}
              {meta && <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginTop: 2 }}>{meta}</div>}
              {(c.tags || []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {c.tags.map(t => <span key={t} style={{ fontSize: NL() ? 13 : 10, padding: "2px 8px", borderRadius: 999, background: "var(--dm-accent-soft, rgba(108,142,255,.12))", color: NL() ? UI.accent : "var(--dm-accent, #6C8EFF)" }}>{t}</span>)}
                </div>
              )}
            </button>
          );
        })}
        {filtered.length > shown.length && (
          <button onClick={() => setMore({ key: listKey, n: limit + PAGE })} style={{ ...S.btnGhost, marginTop: 0, marginBottom: 8 }}>
            {Math.min(PAGE, filtered.length - shown.length)}명 더 보기 (남은 {filtered.length - shown.length}명 · 검색하면 빨라요)
          </button>
        )}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--dm-muted)", fontSize: bodyFs() }}>
            {contacts.length === 0 ? "아직 등록된 사람이 없어요" : "검색 결과가 없어요"}
          </div>
        )}
      </div>

      <div style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, padding: "0 16px", boxSizing: "border-box", pointerEvents: "none", zIndex: 200, display: "flex", gap: 8 }}>
        <button onClick={startAdd} style={{ ...S.btn, flex: 1, marginTop: 0, pointerEvents: "auto", boxShadow: "0 8px 24px var(--dm-accent-soft, rgba(75,111,255,.4))" }}>＋ 사람 추가</button>
        <button onClick={startImport} style={{ ...S.btnGhost, flex: 1, marginTop: 0, pointerEvents: "auto", background: "var(--dm-card)", boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>{pickerSupported ? "📱 연락처에서" : "📇 연락처 파일에서"}</button>
      </div>
      {/* 사진 첨부 원칙과 같이 capture 속성 없음 (CLAUDE.md 7장) */}
      <input ref={fileRef} type="file" accept=".vcf,text/vcard,text/x-vcard" onChange={onVcfFile} style={{ display: "none" }} />
      {importCandidates && (
        <ContactImportSheet candidates={importCandidates} allTags={contactTags} onImport={finishImport} onClose={() => setImportCandidates(null)} />
      )}
      {importGuide && <ContactPermissionGuide mode={importGuide} onContinue={openPicker} onClose={() => setImportGuide(null)} onFile={() => { setImportGuide(null); setVcfGuide(true); }} />}
      {vcfGuide && <VcfGuide onPick={pickVcf} onClose={() => setVcfGuide(false)} />}
      {undo}
      <div style={{ height: 80 }} />
    </div>
  );
}
