import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import { chatFetch } from "../api/chatFetch.js";
import { compressImage } from "../utils/image.js";
import { normName, mergeScanResults, planHoldingsUpdate, applyHoldingsPlan, resolveScanSymbol } from "../utils/holdingsScan.js";

// 잔고 캡처로 보유자산 업데이트 — 사진 고르기 → AI가 읽기 → 확인 화면에서 고른 것만 반영
// 캡처에 없는 종목은 지우지 않는다(사용자가 직접 "삭제"를 고를 때만).
const MAX_PHOTOS = 8;
const APPS = ["키움", "업비트", "빗썸"];

const fmt = (n, cur) => n == null ? "?" : cur === "KRW"
  ? Math.round(n).toLocaleString("ko-KR") + "원"
  : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 });
const numStr = (n) => n == null ? "" : String(Math.round(n * 1e8) / 1e8);
const parseNum = (s) => { const n = parseFloat(String(s).replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = () => reject(new Error("read_failed"));
  r.readAsDataURL(blob);
});

async function searchMarket(q) {
  const res = await fetch(`/api/market?type=search&q=${encodeURIComponent(q)}`);
  const data = await res.json();
  return data.results || [];
}

export default function HoldingsScanSheet({ holdings, usdKrwRate, onApply, onClose }) {
  const fileRef = useRef(null);
  const [scans, setScans] = useState([]);       // 사진별 읽은 결과 { broker, items, notes }
  const [errors, setErrors] = useState([]);
  const [progress, setProgress] = useState(null); // { done, total }
  const [rows, setRows] = useState(null);       // 확인 화면 줄
  const [missing, setMissing] = useState([]);
  const [deleteIds, setDeleteIds] = useState([]);
  const [rate, setRate] = useState(usdKrwRate || null);
  const [app, setApp] = useState(""); // 어느 앱 캡처인지 — 사진만으론 앱을 못 알아볼 때가 있어서 직접 고르게 한다(''=AI가 판단)

  const buildRows = async (allScans, fxRate) => {
    const items = mergeScanResults(allScans);
    const plan = planHoldingsUpdate(holdings, items, fxRate);
    // 사진을 더 넣어 목록을 다시 만들 때, 앞에서 고쳐 둔 칸은 그대로 둔다
    const before = new Map((rows || []).map(r => [r.key, r]));
    const next = await Promise.all(plan.rows.map(async (r) => {
      const key = `${r.item.broker}|${r.item.code}|${normName(r.item.name)}`;
      const old = before.get(key);
      if (old && old.holding?.id === r.holding?.id && old.item.qty === r.item.qty && old.item.avgPrice === r.item.avgPrice) return old;
      const resolved = r.holding ? null : await resolveScanSymbol(r.item, searchMarket);
      return {
        key,
        ...r,
        resolved,
        sym: r.holding?.sym || resolved?.sym || "",
        qtyStr: numStr(r.item.qty),
        avgStr: numStr(r.avgPrice),
        checked: r.status !== "same" && r.item.qty != null && r.avgPrice != null && !!(r.holding || resolved),
      };
    }));
    setRows(next);
    setMissing(plan.missing);
  };

  const pickPhotos = async (e) => {
    const files = [...(e.target.files || [])].slice(0, MAX_PHOTOS);
    e.target.value = "";
    if (!files.length) return;
    setProgress({ done: 0, total: files.length });
    const results = [];
    const errs = [];
    let done = 0;
    await Promise.all(files.map(async (file, idx) => {
      try {
        const blob = await compressImage(file, { maxDim: 1568, quality: 0.85 });
        const image = await blobToBase64(blob);
        const res = await chatFetch("/api/chat?action=holdings-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, mediaType: "image/jpeg" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "읽기 실패");
        results[idx] = { broker: app || (data.broker === "기타" ? "" : data.broker), items: data.items || [], notes: data.notes || "" };
        if (!data.items?.length) errs.push(`${idx + 1}번째 사진: 종목을 찾지 못했어요`);
      } catch (err) {
        errs.push(`${idx + 1}번째 사진: ${err.message === "unsupported_image" ? "이 사진 형식은 읽을 수 없어요" : err.message}`);
      } finally {
        done++;
        setProgress({ done, total: files.length });
      }
    }));
    // 원화 코인 평균단가를 달러로 바꾸려면 환율이 필요하다
    let fxRate = rate;
    if (!fxRate) {
      try {
        const r = await fetch("/api/market?type=fx&from=USD&to=KRW");
        const d = await r.json();
        if (d?.ok && d.rate) { fxRate = d.rate; setRate(d.rate); }
      } catch { /* 환율이 없으면 바꿀 수 없는 줄은 평균단가를 직접 넣게 둔다 */ }
    }
    const allScans = [...scans, ...results.filter(Boolean)];
    setScans(allScans);
    setErrors(prev => [...prev, ...errs]);
    await buildRows(allScans, fxRate);
    setProgress(null);
  };

  const updateRow = (key, patch) => setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
  const toggleDelete = (id) => setDeleteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const ready = (rows || []).filter(r => r.checked);
  const dels = deleteIds.filter(id => missing.some(h => h.id === id)); // 사진을 더 넣어 목록이 바뀌면 캡처에 다시 나온 종목은 삭제 대상에서 빠진다
  const invalid = ready.filter(r => !parseNum(r.qtyStr) || !parseNum(r.avgStr) || (!r.holding && !r.sym.trim()));

  const apply = () => {
    if (invalid.length) return;
    if (!ready.length && !dels.length) return;
    if (dels.length && !window.confirm(`캡처에 없는 ${dels.length}개 종목을 삭제할까요?`)) return;
    const accepted = ready.map(r => {
      let sym = r.holding?.sym || r.sym.trim().toUpperCase();
      if (/^\d{6}$/.test(sym)) sym = `${sym}.KS`;
      const typed = !r.resolved || r.resolved.sym !== sym;
      const src = r.resolved && !typed ? r.resolved.src
        : r.item.kind === "coin" ? "coingecko" : /\.(KS|KQ)$/.test(sym) ? "yahoo" : "finnhub";
      return {
        holding: r.holding, sym,
        label: r.holding ? r.holding.label : (r.item.name || sym),
        src, currency: r.currency,
        ...(r.resolved?.coinId && !typed ? { coinId: r.resolved.coinId } : {}),
        qty: parseNum(r.qtyStr), avgPrice: parseNum(r.avgStr),
        broker: r.item.broker,
      };
    });
    onApply(applyHoldingsPlan(holdings, accepted, dels), { count: accepted.length, deleted: dels.length });
  };

  const badge = (text, color) => (
    <span style={{ fontSize: 10, fontWeight: 800, color, border: `1px solid ${color}`, borderRadius: 6, padding: "1px 5px", flexShrink: 0 }}>{text}</span>
  );
  const smallInput = { ...S.input, marginBottom: 0, padding: "6px 8px", fontSize: 13 };

  const portalTarget = document.querySelector(".dm-phone") || document.body;
  return createPortal(
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 310, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 520, maxHeight: "92%", display: "flex", flexDirection: "column", background: "var(--dm-bg)", borderRadius: "18px 18px 0 0", border: "1px solid var(--dm-border)" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 10px" }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: "var(--dm-text)" }}>📷 캡처로 업데이트</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 20, cursor: "pointer", padding: 0 }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", padding: "0 18px 12px", flex: 1 }}>
          {!rows && !progress && (
            <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.6, marginBottom: 12 }}>
              키움증권·업비트·빗썸의 <b>잔고 화면</b>을 캡처해서 골라주세요. 여러 장(최대 {MAX_PHOTOS}장)을 한 번에 골라도 돼요.
              <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 8 }}>
                • 종목명·보유수량·평균단가가 보이게 찍어주세요<br />
                • 아래에서 앱을 고르고 그 앱 캡처만 골라주세요. 다른 앱은 반영 전 "＋ 사진 더 추가"로 이어서 넣으면 돼요<br />
                • 사진은 AI(Anthropic)가 내용을 읽는 데만 쓰고 저장하지 않아요. 계좌번호는 잘라서 올리면 더 안전해요<br />
                • 반영 전에 확인 화면에서 고칠 수 있어요. 캡처에 없는 종목은 지우지 않아요
              </div>
            </div>
          )}

          {progress && (
            <div style={{ textAlign: "center", padding: "28px 0", fontSize: 13, color: "var(--dm-muted)" }}>
              사진 읽는 중... {progress.done}/{progress.total}
            </div>
          )}

          {errors.length > 0 && (
            <div style={{ fontSize: 11, color: "#F87171", lineHeight: 1.6, marginBottom: 8 }}>
              {errors.map((e, i) => <div key={i}>⚠️ {e}</div>)}
            </div>
          )}

          {rows && !progress && (
            <>
              {rows.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--dm-muted)", padding: "16px 0" }}>읽은 종목이 없어요. 잔고 화면이 잘 보이게 다시 캡처해 주세요.</div>
              )}
              {rows.map(r => {
                const cur = r.currency;
                const qtyChanged = r.holding && parseNum(r.qtyStr) !== r.holding.qty;
                const avgChanged = r.holding && Math.abs((parseNum(r.avgStr) || 0) - r.holding.avgPrice) > r.holding.avgPrice * 0.0005;
                return (
                  <div key={r.key} style={{ padding: "10px 0", borderBottom: "1px solid var(--dm-row)", opacity: r.checked ? 1 : 0.55 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={r.checked} onChange={e => updateRow(r.key, { checked: e.target.checked })} style={{ width: 18, height: 18, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 900, color: "var(--dm-text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.holding?.label || r.item.name || r.item.code}
                      </span>
                      {r.item.broker && <span style={{ fontSize: 11, color: "var(--dm-muted)", flexShrink: 0 }}>{r.item.broker}</span>}
                      <span style={{ flex: 1 }} />
                      {r.status === "new" ? badge("새 종목", "#6C8EFF") : r.status === "same" ? badge("변동 없음", "var(--dm-muted)") : badge("바뀜", "#F59E0B")}
                    </label>
                    {r.holding && (
                      <div style={{ fontSize: 11, color: "var(--dm-muted)", margin: "4px 0 0 26px" }}>
                        지금: {r.holding.qty} · {fmt(r.holding.avgPrice, r.holding.currency || cur)}
                        {(qtyChanged || avgChanged) && <span style={{ color: "#F59E0B" }}> → 바뀜</span>}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: r.holding ? "1fr 1fr" : "1fr 1fr 1fr", gap: 6, margin: "6px 0 0 26px" }}>
                      {!r.holding && (
                        <div>
                          <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 2 }}>종목 코드</div>
                          <input value={r.sym} onChange={e => updateRow(r.key, { sym: e.target.value.toUpperCase(), ...(e.target.value.trim() ? { checked: true } : {}) })}
                            placeholder={r.item.kind === "coin" ? "예: BTC" : "예: 005930"}
                            style={{ ...smallInput, borderColor: r.checked && !r.sym.trim() ? "#F87171" : undefined }} />
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 2 }}>보유 수량</div>
                        <input value={r.qtyStr} onChange={e => updateRow(r.key, { qtyStr: e.target.value })} inputMode="decimal"
                          style={{ ...smallInput, borderColor: r.checked && !parseNum(r.qtyStr) ? "#F87171" : undefined }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 2 }}>평균단가 ({cur === "KRW" ? "원" : "$"})</div>
                        <input value={r.avgStr} onChange={e => updateRow(r.key, { avgStr: e.target.value })} inputMode="decimal"
                          style={{ ...smallInput, borderColor: r.checked && !parseNum(r.avgStr) ? "#F87171" : undefined }} />
                      </div>
                    </div>
                    {r.converted && (
                      <div style={{ fontSize: 10, color: "var(--dm-muted)", margin: "4px 0 0 26px" }}>
                        {r.avgPrice != null
                          ? `캡처 평균단가 ${fmt(r.item.avgPrice, r.item.currency)}를 현재 환율(1달러 ≈ ${Math.round(rate).toLocaleString("ko-KR")}원)로 바꿨어요`
                          : `캡처 평균단가 ${fmt(r.item.avgPrice, r.item.currency)} — 환율을 못 불러와 직접 넣어주세요`}
                      </div>
                    )}
                    {!r.holding && !r.resolved && (
                      <div style={{ fontSize: 10, color: "#F87171", margin: "4px 0 0 26px" }}>종목 코드를 찾지 못했어요. 직접 넣으면 반영돼요{r.item.kind === "kr_stock" ? " (코스닥 종목은 코드 뒤에 .KQ)" : ""}</div>
                    )}
                  </div>
                );
              })}

              {missing.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-text)", marginBottom: 4 }}>캡처에 없는 종목</div>
                  <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 6 }}>그대로 둬요. 팔아서 없어진 종목만 "삭제"를 골라주세요.</div>
                  {missing.map(h => (
                    <label key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
                      <span style={{ flex: 1, fontSize: 13, color: "var(--dm-text)" }}>
                        {h.label || h.sym} <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>{h.broker} · {h.qty}</span>
                      </span>
                      <input type="checkbox" checked={deleteIds.includes(h.id)} onChange={() => toggleDelete(h.id)} style={{ width: 18, height: 18 }} />
                      <span style={{ fontSize: 12, color: "#F87171" }}>삭제</span>
                    </label>
                  ))}
                </div>
              )}

              {scans.some(s => s.notes) && (
                <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 10, lineHeight: 1.5 }}>
                  AI 메모: {scans.filter(s => s.notes).map(s => s.notes).join(" / ")}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "10px 18px 18px", borderTop: "1px solid var(--dm-border)" }}>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={pickPhotos} style={{ display: "none" }} />
          {!progress && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--dm-muted)", marginRight: 2 }}>{rows ? "추가할 사진" : "어느 앱 캡처?"}</span>
              {[...APPS, ""].map(a => (
                <button key={a || "auto"} onClick={() => setApp(a)}
                  style={{
                    fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${app === a ? "#6C8EFF" : "var(--dm-border)"}`,
                    background: app === a ? "rgba(108,142,255,.14)" : "transparent",
                    color: app === a ? "#6C8EFF" : "var(--dm-sub)",
                  }}>{a || "자동"}</button>
              ))}
            </div>
          )}
          {rows && !progress ? (
            <>
              {invalid.length > 0 && (
                <div style={{ fontSize: 11, color: "#F87171", marginBottom: 6 }}>빨간 칸을 채우거나 그 줄의 체크를 풀어주세요</div>
              )}
              <button onClick={apply} disabled={!!invalid.length || (!ready.length && !dels.length)}
                style={{ ...S.btn, marginBottom: 8, opacity: invalid.length || (!ready.length && !dels.length) ? 0.5 : 1 }}>
                {ready.length}개 반영{dels.length ? ` · ${dels.length}개 삭제` : ""}
              </button>
              <button onClick={() => fileRef.current?.click()} style={{ ...S.btnGhost, marginTop: 0 }}>＋ 사진 더 추가</button>
            </>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={!!progress} style={{ ...S.btn, opacity: progress ? 0.5 : 1 }}>
              사진 고르기
            </button>
          )}
        </div>
      </div>
    </div>,
    portalTarget
  );
}
