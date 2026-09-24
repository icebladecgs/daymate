import { useState } from "react";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";
import PhotoAttach from "../components/PhotoAttach.jsx";
import ContactImportSheet from "../components/ContactImportSheet.jsx";
import { toDateStr, formatKoreanDate } from "../utils/date.js";
import {
  newContact, genSubId, searchContacts, buildImportCandidates,
  getNextSolarOccurrence, daysUntil,
} from "../data/contacts.js";

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 입력 검증용(윤년 여부는 신경쓰지 않고 넉넉하게 29일까지 허용)

function Header({ title, onBack, right }) {
  return (
    <div style={S.topbar}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--dm-text)", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0 }}>←</button>
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
        <button key={t} type="button" onClick={() => onToggle(t)} style={S.pill(selected.includes(t))}>{t}</button>
      ))}
      {adding ? (
        <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(""); setAdding(false); } }}
          placeholder="태그 이름" maxLength={12}
          style={{ ...S.input, width: 100, padding: "6px 10px", fontSize: 12, marginBottom: 0 }} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ ...S.pill(false), borderStyle: "dashed" }}>＋ 태그</button>
      )}
    </div>
  );
}

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
    <div style={{ padding: "0 16px" }}>
      <div style={{ ...S.card, margin: "12px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: 6 }}>이름 *</div>
        <input autoFocus value={draft.name} onChange={e => set({ name: e.target.value })} placeholder="이름 (필수)" maxLength={30} style={S.input} />

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input value={draft.company} onChange={e => set({ company: e.target.value })} placeholder="회사" maxLength={40} style={{ ...S.input, marginBottom: 0 }} />
          <input value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="직책" maxLength={20} style={{ ...S.input, marginBottom: 0 }} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", margin: "12px 0 6px" }}>관계 태그</div>
        <TagPicker allTags={allTags} selected={draft.tags || []} onAddTag={onAddTag}
          onToggle={(t) => set({ tags: (draft.tags || []).includes(t) ? draft.tags.filter(x => x !== t) : [...(draft.tags || []), t] })} />
      </div>

      {!expanded ? (
        <button onClick={() => setExpanded(true)} style={{ ...S.btnGhost, marginTop: 0 }}>＋ 연락처·생일·메모 등 추가 정보 입력 ▾</button>
      ) : (
        <>
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: 6 }}>연락처</div>
            <input value={draft.phone} onChange={e => set({ phone: e.target.value })} placeholder="전화번호" maxLength={20} style={S.input} />
            <input value={draft.email} onChange={e => set({ email: e.target.value })} placeholder="이메일" maxLength={60} style={{ ...S.input, marginBottom: 0 }} />
          </div>

          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: 8 }}>생일</div>
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
              <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 8, lineHeight: 1.5 }}>
                음력 날짜는 매년 양력으로 변환해 알려드려요. 윤달에 태어난 경우 평달로 계산되어 실제와 하루 이상 어긋날 수 있어요.
              </div>
            )}
          </div>

          <div style={S.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)" }}>기타 기념일 (양력)</div>
              <button type="button" onClick={addAnniversary} style={{ background: "none", border: "none", color: "#6C8EFF", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>＋ 추가</button>
            </div>
            {(draft.anniversaries || []).map(a => (
              <div key={a.id} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                <input value={a.name} onChange={e => updateAnniversary(a.id, { name: e.target.value })} placeholder="이름 (예: 결혼기념일)" style={{ ...S.input, flex: 1.4, marginBottom: 0 }} />
                <input type="number" min={1} max={12} value={a.month} onChange={e => updateAnniversary(a.id, { month: e.target.value ? Number(e.target.value) : "" })} placeholder="월" style={{ ...S.input, flex: 1, marginBottom: 0 }} />
                <input type="number" min={1} max={31} value={a.day} onChange={e => updateAnniversary(a.id, { day: e.target.value ? Number(e.target.value) : "" })} placeholder="일" style={{ ...S.input, flex: 1, marginBottom: 0 }} />
                <button type="button" onClick={() => removeAnniversary(a.id)} style={{ background: "none", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer" }}>✕</button>
              </div>
            ))}
            {(draft.anniversaries || []).length === 0 && <div style={{ fontSize: 12, color: "var(--dm-muted)" }}>등록된 기념일이 없어요</div>}
          </div>

          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: 8 }}>처음 만난 날 / 장소</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" value={draft.firstMet?.date || ""} onChange={e => set({ firstMet: { ...draft.firstMet, date: e.target.value } })} style={{ ...S.input, marginBottom: 0, flex: 1 }} />
              <input value={draft.firstMet?.place || ""} onChange={e => set({ firstMet: { ...draft.firstMet, place: e.target.value } })} placeholder="장소" style={{ ...S.input, marginBottom: 0, flex: 1 }} />
            </div>
          </div>

          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: 8 }}>소개해준 사람</div>
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

          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: 8 }}>자유 메모</div>
            <textarea value={draft.memo} onChange={e => set({ memo: e.target.value })} placeholder="취미, 관심사, 좋아하는 음식, 기억할 점 등" rows={4}
              style={{ ...S.input, marginBottom: 0, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          <div style={S.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)" }}>명함 (앞면 · 뒷면)</div>
              {uid && <button type="button" onClick={addCard} style={{ background: "none", border: "none", color: "#6C8EFF", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>＋ 명함 추가</button>}
            </div>
            {!uid && <div style={{ fontSize: 12, color: "var(--dm-muted)" }}>로그인 후 명함 사진을 첨부할 수 있어요</div>}
            {(draft.cards || []).map(card => (
              <div key={card.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--dm-row)" }}>
                <div style={{ textAlign: "center" }}>
                  <PhotoAttach uid={uid} pathPrefix={`users/${uid}/contacts/${draft.id}`} size={64}
                    photoUrl={card.frontUrl} photoPath={card.frontPath}
                    onChange={(r) => updateCard(card.id, { frontUrl: r?.url || null, frontPath: r?.path || null })}
                    onError={onError} />
                  <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 4 }}>앞면</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <PhotoAttach uid={uid} pathPrefix={`users/${uid}/contacts/${draft.id}`} size={64}
                    photoUrl={card.backUrl} photoPath={card.backPath}
                    onChange={(r) => updateCard(card.id, { backUrl: r?.url || null, backPath: r?.path || null })}
                    onError={onError} />
                  <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 4 }}>뒷면</div>
                </div>
                <button type="button" onClick={() => removeCard(card.id)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer" }}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, margin: "4px 0 20px" }}>
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
    <div style={{ fontSize: 13, color: "var(--dm-text)" }}>
      🎂 {label}
      {dday != null && <span style={{ color: "#6C8EFF", fontWeight: 900, marginLeft: 6 }}>{dday === 0 ? "오늘!" : `D-${dday}`}</span>}
    </div>
  );
}

// ── 사람 상세 화면 ──
function ContactDetail({ contact, plans, onBack, onEdit, onDelete, onAddMeeting, onAddFollowupTask, onToggleTaskForDate, onOpenDate, contacts }) {
  const [meetingDate, setMeetingDate] = useState(toDateStr());
  const [meetingNote, setMeetingNote] = useState("");
  const [addingFollowup, setAddingFollowup] = useState(null); // meetingId | null
  const [followupTitle, setFollowupTitle] = useState("");
  const [followupDate, setFollowupDate] = useState(toDateStr());

  const introducedByName = contact.introducedBy?.personId
    ? contacts.find(c => c.id === contact.introducedBy.personId)?.name
    : contact.introducedBy?.text;

  const submitMeeting = () => {
    if (!meetingNote.trim()) return;
    onAddMeeting({ id: genSubId("mt"), date: meetingDate, note: meetingNote.trim(), createdAt: new Date().toISOString() });
    setMeetingNote("");
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

  return (
    <div style={S.content}>
      <Header title={contact.name} onBack={onBack} right={
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={onEdit} style={{ background: "none", border: "none", color: "#6C8EFF", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>수정</button>
          <button onClick={onDelete} style={{ background: "none", border: "none", color: "#F87171", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>삭제</button>
        </div>
      } />

      {(contact.company || contact.title || contact.phone || contact.email || (contact.tags || []).length > 0) && (
        <div style={S.card}>
          {(contact.company || contact.title) && <div style={{ fontSize: 13, color: "var(--dm-sub)", marginBottom: 4 }}>{[contact.company, contact.title].filter(Boolean).join(" · ")}</div>}
          {contact.phone && <a href={`tel:${contact.phone}`} style={{ display: "block", fontSize: 13, color: "#6C8EFF", textDecoration: "none" }}>📞 {contact.phone}</a>}
          {contact.email && <div style={{ fontSize: 13, color: "var(--dm-text)" }}>✉️ {contact.email}</div>}
          {(contact.tags || []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {contact.tags.map(t => <span key={t} style={S.pill(true)}>{t}</span>)}
            </div>
          )}
        </div>
      )}

      {(contact.birthday || (contact.anniversaries || []).length > 0) && (
        <div style={S.card}>
          <BirthdayLine birthday={contact.birthday} />
          {(contact.anniversaries || []).map(a => a.month && a.day && (
            <div key={a.id} style={{ fontSize: 13, color: "var(--dm-text)", marginTop: 4 }}>
              📌 {a.name || "기념일"} · {a.month}월 {a.day}일
            </div>
          ))}
        </div>
      )}

      {(contact.firstMet?.date || contact.firstMet?.place || introducedByName) && (
        <div style={S.card}>
          {(contact.firstMet?.date || contact.firstMet?.place) && (
            <div style={{ fontSize: 13, color: "var(--dm-text)" }}>👋 처음 만남: {contact.firstMet?.date ? formatKoreanDate(contact.firstMet.date) : ""} {contact.firstMet?.place}</div>
          )}
          {introducedByName && <div style={{ fontSize: 13, color: "var(--dm-text)", marginTop: 4 }}>🔗 소개: {introducedByName}</div>}
        </div>
      )}

      {contact.memo && (
        <div style={S.card}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: 6 }}>메모</div>
          <div style={{ fontSize: 13, color: "var(--dm-text)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{contact.memo}</div>
        </div>
      )}

      {(contact.cards || []).length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: 8 }}>명함 {contact.cards.length > 1 ? `(최근 ${contact.cards.length}장)` : ""}</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
            {contact.cards.slice().reverse().flatMap(c => [c.frontUrl, c.backUrl]).filter(Boolean).map((url, i) => (
              <img key={i} src={url} alt="명함" style={{ width: 120, height: 76, objectFit: "cover", borderRadius: 8, border: "1px solid var(--dm-border)", flexShrink: 0 }} />
            ))}
          </div>
        </div>
      )}

      {(contact.linkedTasks || []).length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: 8 }}>연결된 할 일</div>
          {contact.linkedTasks.map(lt => {
            const liveTask = (plans[lt.date]?.tasks || []).find(t => t.id === lt.taskId);
            const done = liveTask ? liveTask.done : false;
            const title = liveTask ? liveTask.title : lt.title;
            return (
              <button key={lt.taskId} onClick={() => onOpenDate(lt.date)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", padding: "6px 0", cursor: "pointer", textAlign: "left" }}>
                <span onClick={(e) => { e.stopPropagation(); onToggleTaskForDate(lt.date, lt.taskId); }} style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${done ? "rgba(74,222,128,.5)" : "var(--dm-border)"}`, background: done ? "rgba(74,222,128,.15)" : "var(--dm-input)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#4ADE80" }}>{done ? "✓" : ""}</span>
                <span style={{ flex: 1, fontSize: 13, color: done ? "var(--dm-muted)" : "var(--dm-text)", textDecoration: done ? "line-through" : "none" }}>{title}</span>
                <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>{formatKoreanDate(lt.date)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={S.card}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: 8 }}>만남 기록</div>
        {(contact.meetings || []).slice().reverse().map(m => (
          <div key={m.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--dm-row)" }}>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 3 }}>{formatKoreanDate(m.date)}</div>
            <div style={{ fontSize: 13, color: "var(--dm-text)", whiteSpace: "pre-wrap" }}>{m.note}</div>
            {addingFollowup === m.id ? (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input value={followupTitle} onChange={e => setFollowupTitle(e.target.value)} placeholder="할 일 제목" style={{ ...S.input, flex: 1.5, marginBottom: 0, fontSize: 12, padding: "8px 10px" }} />
                <input type="date" value={followupDate} onChange={e => setFollowupDate(e.target.value)} style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 12, padding: "8px 10px" }} />
                <button onClick={submitFollowup} style={{ background: "#6C8EFF", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 900, padding: "0 10px", cursor: "pointer" }}>추가</button>
              </div>
            ) : (
              <button onClick={() => { setAddingFollowup(m.id); setFollowupTitle(""); setFollowupDate(toDateStr()); }} style={{ marginTop: 6, background: "none", border: "none", color: "#6C8EFF", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>＋ 할 일 추가</button>
            )}
          </div>
        ))}
        {(contact.meetings || []).length === 0 && <div style={{ fontSize: 12, color: "var(--dm-muted)", marginBottom: 10 }}>아직 기록이 없어요</div>}

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

export default function People({
  contacts, onUpsertContact, onDeleteContact,
  contactTags, setContactTags,
  contactAlarmCfg, setContactAlarmCfg,
  plans, onAddFollowupTask, onToggleTaskForDate, onOpenDate,
  authUser, toast, setToast, onBack,
}) {
  const [view, setView] = useState("list"); // list | detail | form
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [tagFilters, setTagFilters] = useState([]);
  const [showAlarmSettings, setShowAlarmSettings] = useState(false);

  const uid = authUser?.uid;
  const selected = contacts.find(c => c.id === selectedId) || null;
  const filtered = searchContacts(contacts, query).filter(c => tagFilters.length === 0 || tagFilters.some(t => (c.tags || []).includes(t)));

  const startAdd = () => { setDraft(newContact("")); setView("form"); };

  // 휴대폰 연락처에서 가져오기 (Contact Picker API — 안드로이드 크롬·설치형 앱 지원, 아이폰 미지원)
  // 운영체제의 연락처 선택 창에서 사용자가 직접 고른 사람만 앱에 전달됨 (주소록 전체를 읽지 않음)
  const [importCandidates, setImportCandidates] = useState(null);
  const pickerSupported = typeof navigator !== "undefined" && "contacts" in navigator && typeof navigator.contacts?.select === "function";
  const startImport = async () => {
    if (!pickerSupported) {
      setToast?.("휴대폰 연락처 가져오기는 안드로이드에서 돼요. 아이폰은 곧 파일로 가져오기를 지원할 예정이에요");
      return;
    }
    try {
      const picked = await navigator.contacts.select(["name", "tel", "email"], { multiple: true });
      if (!picked?.length) return;
      const candidates = buildImportCandidates(picked, contacts);
      if (!candidates.length) { setToast?.("가져올 수 있는 연락처가 없어요"); return; }
      setImportCandidates(candidates);
    } catch {
      setToast?.("연락처를 불러오지 못했어요");
    }
  };
  const finishImport = (chosen, tags) => {
    chosen.forEach(x => onUpsertContact({ ...newContact(x.name), phone: x.phone, email: x.email, tags: [...tags] }));
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

  const handleDelete = () => {
    if (!selected) return;
    if (!window.confirm(`${selected.name}님을 삭제할까요? 연결된 할 일은 그대로 남고, 이 사람과의 연결만 해제돼요.`)) return;
    onDeleteContact(selected.id);
    setView("list");
    setSelectedId(null);
    setToast?.("삭제했어요");
  };

  const handleAddMeeting = (meetingObj) => {
    if (!selected) return;
    onUpsertContact({ ...selected, meetings: [...(selected.meetings || []), meetingObj] });
  };

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
          onAddMeeting={handleAddMeeting}
          onAddFollowupTask={(date, title) => onAddFollowupTask(selected.id, date, title)}
          onToggleTaskForDate={onToggleTaskForDate}
          onOpenDate={onOpenDate}
        />
      </>
    );
  }

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <Header title="내 사람들" onBack={onBack} />

      <div style={{ padding: "12px 16px 0" }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름·초성·전화번호·회사·태그 검색" style={{ ...S.input, marginBottom: 8 }} />
        {pickerSupported && (
          <div style={{ fontSize: 11, color: 'var(--dm-muted)', lineHeight: 1.5, marginBottom: 8 }}>
            💡 아래 "📱 연락처에서"를 누른 뒤 선택 창 맨 위 <b>모두 선택</b>을 누르면, 전체 연락처를 여기서 검색하며 골라 등록할 수 있어요
          </div>
        )}
        {contactTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
            {contactTags.map(t => (
              <button key={t} onClick={() => setTagFilters(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} style={S.pill(tagFilters.includes(t))}>{t}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "0 16px 8px" }}>
        <button onClick={() => setShowAlarmSettings(v => !v)} style={{ background: "none", border: "none", color: "var(--dm-muted)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>
          🔔 생일 알림 설정 {showAlarmSettings ? "▲" : "▼"}
        </button>
        {showAlarmSettings && (
          <div style={{ ...S.card, margin: "8px 0 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>생일·기념일 알림</span>
              <button onClick={() => setContactAlarmCfg({ ...contactAlarmCfg, enabled: !contactAlarmCfg.enabled })}
                style={{ width: 44, height: 24, borderRadius: 999, background: contactAlarmCfg.enabled ? "#6C8EFF" : "var(--dm-border)", border: "none", position: "relative", cursor: "pointer" }}>
                <span style={{ position: "absolute", top: 3, left: contactAlarmCfg.enabled ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
              </button>
            </div>
            {contactAlarmCfg.enabled && (
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {[{ v: 0, l: "당일" }, { v: 3, l: "3일 전" }, { v: 7, l: "7일 전" }].map(opt => {
                  const on = (contactAlarmCfg.offsets || []).includes(opt.v);
                  return (
                    <button key={opt.v} onClick={() => setContactAlarmCfg({ ...contactAlarmCfg, offsets: on ? contactAlarmCfg.offsets.filter(v => v !== opt.v) : [...(contactAlarmCfg.offsets || []), opt.v] })}
                      style={S.pill(on)}>{opt.l}</button>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 10, lineHeight: 1.5 }}>
              현재는 홈 화면 "오늘 챙길 사람" 영역에만 표시돼요. 앱을 닫아도 오는 알림(푸시·텔레그램) 연동은 다음 단계에서 진행할 예정이에요.
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "8px 16px 0" }}>
        {filtered.map(c => (
          <button key={c.id} onClick={() => { setSelectedId(c.id); setView("detail"); }}
            style={{ width: "100%", textAlign: "left", background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 14, padding: "12px 14px", marginBottom: 8, cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "var(--dm-text)" }}>{c.name}</div>
            {(c.company || c.title) && <div style={{ fontSize: 12, color: "var(--dm-sub)", marginTop: 2 }}>{[c.company, c.title].filter(Boolean).join(" · ")}</div>}
            {(c.tags || []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {c.tags.map(t => <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(108,142,255,.12)", color: "#6C8EFF" }}>{t}</span>)}
              </div>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--dm-muted)", fontSize: 13 }}>
            {contacts.length === 0 ? "아직 등록된 사람이 없어요" : "검색 결과가 없어요"}
          </div>
        )}
      </div>

      <div style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, padding: "0 16px", boxSizing: "border-box", pointerEvents: "none", zIndex: 200, display: "flex", gap: 8 }}>
        <button onClick={startAdd} style={{ ...S.btn, flex: 1, marginTop: 0, pointerEvents: "auto", boxShadow: "0 8px 24px rgba(75,111,255,.4)" }}>＋ 사람 추가</button>
        <button onClick={startImport} style={{ ...S.btnGhost, flex: 1, marginTop: 0, pointerEvents: "auto", background: "var(--dm-card)", boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>📱 연락처에서</button>
      </div>
      {importCandidates && (
        <ContactImportSheet candidates={importCandidates} allTags={contactTags} onImport={finishImport} onClose={() => setImportCandidates(null)} />
      )}
      <div style={{ height: 80 }} />
    </div>
  );
}
