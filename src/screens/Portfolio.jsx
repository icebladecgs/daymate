import { useState, useEffect, useRef } from "react";
import { saveSettings } from "../firebase.js";
import { store } from "../utils/storage.js";
import { toDateStr } from "../utils/date.js";
import { fetchMarketDataFromServer } from "../api/telegram.js";
import { calcPortfolioSummary } from "../utils/portfolioCalc.js";
import { readTabs, tabHoldings, tabCash, setTabHoldings, setTabCash, addTab, renameTab, removeTab, restoreTab, makeReal, groupHoldings, allTabHoldings, roundQty, PF_MAX_TABS } from "../utils/portfolioTabs.js";
import { isPfHidden, setPfHidden, HIDE_EVENT, MASK, allocation, historySeries, projectDividends, dividendMonths, dividendTotal, dividendSymOf, INDEX_SYM, indexWhatIf } from "../utils/portfolioExtras.js";
import { localPfHistory, notePfValue, syncPfHistory } from "../utils/pfHistory.js";
import { fetchDividends } from "../api/dividends.js";
import { AllocationBar, TrendChart, DividendMonths } from "../components/PortfolioCharts.jsx";
import { useUndo } from "../utils/useUndo.js";
import S, { UI } from "../styles.js";
import Toast from "../components/Toast.jsx";
import UndoBar from "../components/UndoBar.jsx";
import HoldingsScanSheet from "../components/HoldingsScanSheet.jsx";
import { newDesignOn } from "../utils/todayLook.js";

const NL = () => newDesignOn(); // 새 디자인이면 작은 글씨를 13px 이상으로

const PRESET_ASSETS = [
  { sym: "BTC",  label: "비트코인",       src: "coingecko", coinId: "bitcoin",     currency: "USD" },
  { sym: "ETH",  label: "이더리움",       src: "coingecko", coinId: "ethereum",    currency: "USD" },
  { sym: "SOL",  label: "솔라나",         src: "coingecko", coinId: "solana",      currency: "USD" },
  { sym: "XRP",  label: "리플",           src: "coingecko", coinId: "ripple",      currency: "USD" },
  { sym: "DOGE", label: "도지코인",       src: "coingecko", coinId: "dogecoin",    currency: "USD" },
  { sym: "ADA",  label: "카르다노",       src: "coingecko", coinId: "cardano",     currency: "USD" },
  { sym: "BNB",  label: "바이낸스코인",   src: "coingecko", coinId: "binancecoin", currency: "USD" },
  { sym: "TSLA", label: "테슬라",         src: "finnhub",                       currency: "USD" },
  { sym: "GOOGL",label: "구글",           src: "finnhub",                       currency: "USD" },
  { sym: "QQQ",  label: "나스닥100(QQQ)", src: "finnhub",                       currency: "USD" },
  { sym: "NVDA", label: "엔비디아",       src: "finnhub",                       currency: "USD" },
  { sym: "AAPL", label: "애플",           src: "finnhub",                       currency: "USD" },
];

const fmtNum = (n, decimals = 2) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmtUSD = (n) => "$" + fmtNum(n);
const fmtKRW = (n) => Math.round(Number(n)).toLocaleString("ko-KR") + "원"; // 원화는 소수점 없이
const fmtPrice = (n, currency) => currency === "KRW" ? fmtKRW(n) : fmtUSD(n);
const fmtPct = (n) => (n >= 0 ? "+" : "") + fmtNum(n) + "%";
const fmtSigned = (n, currency) => (n >= 0 ? "+" : "-") + fmtPrice(Math.abs(n), currency);
const pnlColor = (n) => n > 0 ? "#4ADE80" : n < 0 ? "#F87171" : "var(--dm-muted)";

function pad2(n) { return String(n).padStart(2, "0"); }
function formatMemoDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
// 탭의 마지막 저장일 — 탭끼리 구분하려고 보여 준다
const fmtSaved = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`; };

const PF_CACHE_PREFIX = "dm_portfolio_prices_";
const FX_CACHE_PREFIX = "dm_fx_usd_krw_";
const ACCENT = UI.accent;

export default function Portfolio({ telegramCfg, setTelegramCfg, authUser, onBack }) {
  const cacheKey = PF_CACHE_PREFIX + toDateStr();
  const fxCacheKey = FX_CACHE_PREFIX + toDateStr();
  // 보유자산 탭(utils/portfolioTabs.js) — 실계좌 탭의 종목이 예전 그대로 telegram.holdings에 있다
  const [cfg, setCfg] = useState(() => telegramCfg || {});
  const cfgRef = useRef(cfg);
  const [activeId, setActiveId] = useState(() => readTabs(telegramCfg).realId);
  const [panel, setPanel] = useState(null); // 'add' | 'menu' | null — 탭 줄 아래 작은 칸
  const [renameDraft, setRenameDraft] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const undo = useUndo();
  const { tabs } = readTabs(cfg);
  const activeTab = tabs.find(t => t.id === activeId) || tabs.find(t => t.real);
  const holdings = tabHoldings(cfg, activeTab.id);
  const cash = tabCash(cfg, activeTab.id);
  // 👁 금액 숨기기 (기기마다, My 탭 자산 브리핑과 같은 값)
  const [hidden, setHidden] = useState(isPfHidden);
  useEffect(() => {
    const on = (e) => setHidden(!!e.detail);
    window.addEventListener(HIDE_EVENT, on);
    return () => window.removeEventListener(HIDE_EVENT, on);
  }, []);
  const [cashEdit, setCashEdit] = useState(null); // { krw, usd } 입력 중인 글자
  const [trendRange, setTrendRange] = useState(90);
  const [history, setHistory] = useState(localPfHistory);
  const [divData, setDivData] = useState(null);
  const [divOpen, setDivOpen] = useState(false);

  const [marketData, setMarketData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PF_CACHE_PREFIX + toDateStr()) || "null"); } catch { return null; }
  });
  const [usdKrwRate, setUsdKrwRate] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FX_CACHE_PREFIX + toDateStr()) || "null"); } catch { return null; }
  });
  const [displayCurrency, setDisplayCurrency] = useState(() => store.get("dm_pf_display_currency", "USD"));
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandId, setExpandId] = useState(null); // 여러 앱에 나뉜 종목의 앱별 줄 펼치기
  const [memoOpenId, setMemoOpenId] = useState(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [showScan, setShowScan] = useState(false);
  const formRef = useRef(null);

  // 입력 폼 상태
  const [fSym, setFSym] = useState("");
  const [fLabel, setFLabel] = useState("");
  const [fQty, setFQty] = useState("");
  const [fAvgPrice, setFAvgPrice] = useState("");
  const [fCurrency, setFCurrency] = useState("USD");
  const [fSrc, setFSrc] = useState("finnhub");
  const [fCoinId, setFCoinId] = useState("");

  // 이름 검색(종목 이름 → 티커 자동완성)
  const [nameResults, setNameResults] = useState([]);
  const [nameSearching, setNameSearching] = useState(false);
  const [showNameResults, setShowNameResults] = useState(false);

  // 폼 초기화
  const resetForm = () => {
    setFSym(""); setFLabel(""); setFQty(""); setFAvgPrice(""); setFCurrency("USD"); setFSrc("finnhub"); setFCoinId("");
    setNameResults([]); setShowNameResults(false);
    setEditingId(null); setShowForm(false);
  };

  // 종목 이름으로 검색해 티커 자동완성 (신규 등록 시에만 동작, 수정 중엔 비활성)
  useEffect(() => {
    if (editingId) return;
    const q = fLabel.trim();
    if (q.length < 2) { setNameResults([]); setShowNameResults(false); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setNameSearching(true);
      try {
        const res = await fetch(`/api/market?type=search&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!cancelled) { setNameResults(data.results || []); setShowNameResults(true); }
      } catch {
        if (!cancelled) setNameResults([]);
      } finally {
        if (!cancelled) setNameSearching(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [fLabel, editingId]);

  // 수정 창은 그 종목 바로 아래에 열린다 — 화면 밖이면 보이게 옮긴다
  useEffect(() => {
    if (showForm && editingId) formRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [showForm, editingId]);

  const pickSearchResult = (r) => {
    setFSym(r.sym);
    setFLabel(r.label);
    setFSrc(r.src);
    setFCurrency(r.currency);
    setFCoinId(r.coinId || "");
    setShowNameResults(false);
  };

  // 종목 코드가 한국 주식 형태(숫자 6자리 또는 .KS/.KQ)면 소스/통화를 자동으로 맞춰줌
  useEffect(() => {
    const sym = fSym.trim().toUpperCase();
    const isKr = /^\d{6}$/.test(sym) || /\.(KS|KQ)$/i.test(sym);
    if (isKr && fSrc !== "yahoo") {
      setFSrc("yahoo");
      setFCurrency("KRW");
    }
  }, [fSym]); // eslint-disable-line

  // 프리셋 선택
  const pickPreset = (p) => {
    setFSym(p.sym); setFLabel(p.label); setFCurrency(p.currency); setFSrc(p.src); setFCoinId("");
    setShowNameResults(false);
  };

  // 시세 가져오기 — 비교 화면을 위해 모든 탭의 종목을 한 번에 받는다
  const fetchPrices = async (list = allTabHoldings(cfgRef.current)) => {
    if (list.length === 0) return;
    setLoading(true);
    try {
      // 복사해 둔 계좌가 있으면 지수 비교용 QQQ 시세도 같이 (서버 기본 목록에 있는 종목)
      const withIndex = readTabs(cfgRef.current).tabs.some(t => t.base) ? [INDEX_SYM] : [];
      const syms = [...new Set([...list.map(h => h.sym), ...withIndex])];
      const customRegistry = Object.fromEntries(list.map(h => [h.sym, { label: h.label, src: h.src, ...(h.coinId ? { coinId: h.coinId } : {}) }]));
      const data = await fetchMarketDataFromServer(syms, customRegistry);
      if (Object.keys(data).length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setMarketData(data);
      } else {
        setToast("시세 로드 실패");
      }
    } catch { setToast("시세 로드 실패"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const all = allTabHoldings(cfgRef.current);
    // 오늘 받은 시세에 다른 탭 종목이 빠져 있으면 다시 받는다
    const needIndex = readTabs(cfgRef.current).tabs.some(t => t.base) && !(marketData && INDEX_SYM in marketData);
    if (all.length > 0 && (!marketData || needIndex || all.some(h => !(h.sym in marketData)))) fetchPrices(all);
  }, []); // eslint-disable-line

  // 자산 추이 — 계정에 쌓인 기록과 합친다(다른 기기에서 쌓인 점)
  useEffect(() => { syncPfHistory(authUser).then(setHistory); }, [authUser?.uid]); // eslint-disable-line

  // 환율 (KRW 종목을 USD 총액에 합산하기 위함)
  const fetchFxRate = async () => {
    try {
      const res = await fetch("/api/market?type=fx&from=USD&to=KRW");
      const data = await res.json();
      if (data?.ok && data.rate) {
        localStorage.setItem(fxCacheKey, JSON.stringify(data.rate));
        setUsdKrwRate(data.rate);
      }
    } catch { /* 환율 조회 실패 시 원화 종목은 총액과 별도로 표시됨 */ }
  };

  useEffect(() => {
    if (usdKrwRate == null && allTabHoldings(cfgRef.current).length > 0) fetchFxRate();
  }, []); // eslint-disable-line

  // 저장 — 계정 설정 telegram 통째로 (holdings·pfTabs·pfRealId)
  const commit = (next) => {
    cfgRef.current = next;
    setCfg(next);
    setTelegramCfg(next);
    store.set("dm_telegram", next);
    if (authUser) saveSettings(authUser.uid, { telegram: next }).catch(() => {});
    return next;
  };
  // 지금 보고 있는 탭의 종목 저장 (탭의 마지막 저장일도 바뀐다)
  const saveHoldings = (next) => commit(setTabHoldings(cfgRef.current, activeTab.id, next));

  // 추가 / 수정
  const handleSave = () => {
    let sym = fSym.trim().toUpperCase();
    const label = fLabel.trim() || sym;
    const qty = parseFloat(fQty.replace(/,/g, ""));
    const avgPrice = parseFloat(fAvgPrice.replace(/,/g, ""));
    if (!sym) { setToast("종목 코드를 입력해주세요"); return; }
    if (isNaN(qty) || qty <= 0) { setToast("수량을 올바르게 입력해주세요"); return; }
    if (isNaN(avgPrice) || avgPrice <= 0) { setToast("평균단가를 올바르게 입력해주세요"); return; }
    if (/^\d{6}$/.test(sym)) sym = `${sym}.KS`; // 한국 주식 숫자 코드 → 코스피 심볼로 자동 보정

    const preset = PRESET_ASSETS.find(p => p.sym === sym);
    const src = preset?.src || fSrc;
    const existing = editingId ? holdings.find(h => h.id === editingId) : null;
    const holding = {
      id: editingId || `h_${sym}_${Date.now()}`,
      sym, label, src,
      ...(preset?.coinId || fCoinId ? { coinId: preset?.coinId || fCoinId } : {}),
      qty, avgPrice,
      currency: src === 'yahoo' ? fCurrency : 'USD',
      ...(existing?.memos ? { memos: existing.memos } : {}),
      ...(existing?.broker ? { broker: existing.broker } : {}), // 캡처로 반영한 종목의 앱 표시(업비트·빗썸 등) 유지
    };

    const next = editingId
      ? holdings.map(h => h.id === editingId ? holding : h)
      : [...holdings, holding];

    const saved = saveHoldings(next);
    resetForm();
    setToast(editingId ? "수정됨 ✅" : "추가됨 ✅");
    localStorage.removeItem(cacheKey);
    fetchPrices(allTabHoldings(saved));
  };

  const handleEdit = (h) => {
    setEditingId(h.id); setFSym(h.sym); setFLabel(h.label || ""); setFQty(String(h.qty));
    setFAvgPrice(String(h.avgPrice)); setFCurrency(h.currency || "USD"); setFSrc(h.src || "finnhub");
    setFCoinId(h.coinId || ""); setShowNameResults(false);
    setShowForm(true);
  };

  // 잔고 캡처로 업데이트 — 확인 화면에서 고른 것만 들어온다 (지금 보고 있는 탭에 반영)
  const handleScanApply = (next, { count, deleted }) => {
    const saved = saveHoldings(next);
    setShowScan(false);
    setToast(`${count}개 반영${deleted ? ` · ${deleted}개 삭제` : ""} ✅`);
    localStorage.removeItem(cacheKey);
    fetchPrices(allTabHoldings(saved));
  };

  const handleDelete = (id) => {
    saveHoldings(holdings.filter(h => h.id !== id));
    setToast("삭제됨");
  };

  // 메모 — 여러 앱에 나뉜 종목은 첫 번째 앱 줄에 붙인다
  const handleAddMemo = (holdingId) => {
    const text = memoDraft.trim();
    if (!text) return;
    saveHoldings(holdings.map(h => h.id === holdingId
      ? { ...h, memos: [...(h.memos || []), { id: `m_${Date.now()}`, text, createdAt: new Date().toISOString() }] }
      : h));
    setMemoDraft("");
  };

  const handleDeleteMemo = (holdingId, memoId) => {
    saveHoldings(holdings.map(h => h.id === holdingId
      ? { ...h, memos: (h.memos || []).filter(m => m.id !== memoId) }
      : h));
  };

  // ── 탭 ──
  const closeEditors = () => { resetForm(); setExpandId(null); setMemoOpenId(null); setPanel(null); };
  const selectTab = (id) => { closeEditors(); setShowCompare(false); setActiveId(id); };
  // 복사할 때 그날 QQQ 시세·총액(달러)을 남겨 비교 표에서 "그날 QQQ에 넣었다면"을 보여 준다.
  // 시세를 못 받거나 원화 종목이 있는데 환율이 없으면 기준 없이 복사한다
  const indexBase = async (fromId) => {
    try {
      const src = readTabs(cfgRef.current).tabs.find(t => t.id === fromId);
      if (!src) return null;
      const s = calcPortfolioSummary(groupHoldings(tabHoldings(cfgRef.current, fromId)), marketData, usdKrwRate, tabCash(cfgRef.current, fromId));
      if (!s || (s.mixed && !s.fxOk) || s.rows.some(r => r.noData || r.currencyMismatch)) return null;
      let qqq = marketData?.[INDEX_SYM]?.price;
      if (!(qqq > 0)) {
        const d = await fetchMarketDataFromServer([INDEX_SYM], {});
        qqq = d?.[INDEX_SYM]?.price;
        if (qqq > 0) setMarketData(prev => ({ ...(prev || {}), [INDEX_SYM]: d[INDEX_SYM] }));
      }
      return qqq > 0 ? { d: toDateStr(), qqq, usd: Math.round(s.statsUSD.value * 100) / 100 } : null;
    } catch { return null; }
  };
  const createTab = async (fromId) => {
    const base = fromId ? await indexBase(fromId) : null;
    const { cfg: next, id } = addTab(cfgRef.current, { fromId, base });
    if (!id) { setToast(`계좌는 ${PF_MAX_TABS}개까지 만들 수 있어요`); return; }
    commit(next);
    selectTab(id);
    setToast(fromId ? "복사했어요 — 바꿔 볼 종목을 고쳐 보세요" : "새 계좌를 만들었어요");
  };
  const saveRename = () => {
    if (!renameDraft.trim()) return;
    commit(renameTab(cfgRef.current, activeTab.id, renameDraft));
    setPanel(null);
  };
  const setAsReal = () => {
    const prevReal = readTabs(cfgRef.current).realId;
    commit(makeReal(cfgRef.current, activeTab.id));
    setPanel(null);
    undo.offer(`이제 "${activeTab.name}"이(가) 실계좌예요 (자산 브리핑 기준)`, () => commit(makeReal(cfgRef.current, prevReal)));
  };
  const deleteTab = () => {
    const { cfg: next, removed, idx } = removeTab(cfgRef.current, activeTab.id);
    if (!removed) return;
    commit(next);
    selectTab(readTabs(next).realId);
    undo.offer(`"${removed.name}" 계좌를 지웠어요`, () => { commit(restoreTab(cfgRef.current, removed, idx)); selectTab(removed.id); });
  };

  const rows = groupHoldings(holdings); // 같은 종목은 한 줄로 (저장은 앱별 그대로)
  const summary = calcPortfolioSummary(rows, marketData, usdKrwRate, cash);
  const stats = displayCurrency === "KRW" ? summary?.statsKRW : summary?.statsUSD;
  const setDisplayCurrencyPersist = (cur) => { setDisplayCurrency(cur); store.set("dm_pf_display_currency", cur); };
  // 금액은 이 함수로만 — 👁 숨기기면 가린다 (수익률 %는 그대로)
  const money = (n, cur) => hidden ? MASK : fmtPrice(n, cur);
  const qtyText = (q) => hidden ? "•••" : roundQty(q);
  const today = toDateStr();

  // 자산군 비중
  const alloc = summary ? allocation(summary.rows, cash, displayCurrency, usdKrwRate) : null;

  // 자산 추이 기록 — 실계좌만, 모든 종목 시세가 있고 환율 문제가 없을 때 하루 한 점
  const pricesComplete = summary && summary.rows.every(r => !r.noData && !r.currencyMismatch) && (summary.fxOk || !summary.mixed);
  const recordUSD = activeTab.real && pricesComplete ? summary.statsUSD.value : null;
  const recordKRW = activeTab.real && pricesComplete && summary.fxOk ? summary.statsKRW.value : null;
  useEffect(() => {
    if (recordUSD > 0) setHistory(notePfValue(authUser, today, recordUSD, recordKRW));
  }, [recordUSD, recordKRW]); // eslint-disable-line
  const trend = historySeries(history, { days: trendRange, today, currency: displayCurrency });

  // 배당 — 지금 탭 종목의 지난 1년 배당 기록으로 앞으로 1년 예상
  const divSyms = [...new Set(holdings.map(dividendSymOf).filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (!divSyms) { setDivData({}); return; }
    let alive = true;
    fetchDividends(divSyms.split(",")).then(d => { if (alive) setDivData(d); });
    return () => { alive = false; };
  }, [divSyms]);
  const divYahooData = divData ? Object.fromEntries(holdings.map(h => [dividendSymOf(h), divData[dividendSymOf(h)]]).filter(([k, v]) => k && v)) : null;
  const div = divYahooData ? projectDividends(holdings, divYahooData, today) : null;
  const divMonths = div ? dividendMonths(div.events, today, displayCurrency, usdKrwRate) : [];
  const divPre = div ? dividendTotal(div.events, displayCurrency, usdKrwRate) : null;
  const divPost = div ? dividendTotal(div.events, displayCurrency, usdKrwRate, { tax: true }) : null;
  const divUpcomingCount = div ? div.events.filter(e => e.d >= today).length : 0;
  const divSoon = div ? div.events.filter(e => e.d >= today).slice(0, divOpen ? 50 : 3) : [];
  // 배당 수익률 = 예상 연 배당(세전) ÷ 종목 평가금액(현금 제외)
  const investedNow = summary ? (displayCurrency === "KRW" ? summary.statsKRW.invested : summary.statsUSD.invested) : 0;
  const divYield = divPre?.ok && investedNow > 0 ? (divPre.sum / investedNow) * 100 : null;

  // 비교 표 — 탭마다 지금 시세로 계산한 총 평가금액. 실계좌와의 차이로 "그대로 뒀으면"을 본다
  const toDisplay = (usd) => usd == null ? null : displayCurrency === "KRW" ? (usdKrwRate ? usd * usdKrwRate : null) : usd;
  const compareRows = showCompare ? tabs.map(t => {
    const s = calcPortfolioSummary(groupHoldings(tabHoldings(cfg, t.id)), marketData, usdKrwRate, tabCash(cfg, t.id));
    return { ...t, count: tabHoldings(cfg, t.id).length, stats: displayCurrency === "KRW" ? s?.statsKRW : s?.statsUSD,
      whatIf: toDisplay(indexWhatIf(t.base, marketData?.[INDEX_SYM]?.price)) };
  }) : [];
  const realStats = compareRows.find(r => r.real)?.stats;

  // 현금 저장 (지금 탭)
  const saveCash = () => {
    const num = (v) => parseFloat(String(v || "").replace(/[,\s원$₩]/g, "")) || 0;
    commit(setTabCash(cfgRef.current, activeTab.id, { krw: num(cashEdit?.krw), usd: num(cashEdit?.usd) }));
    setCashEdit(null);
    setToast("현금 저장 ✅");
  };

  const inputStyle = { ...S.input, marginBottom: 0 };
  const chipStyle = (on) => ({
    flexShrink: 0, height: UI.touch, padding: "0 14px", borderRadius: 20, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit",
    fontSize: 14, fontWeight: 800,
    border: `1.5px solid ${on ? ACCENT : "var(--dm-border)"}`,
    background: on ? ACCENT : "var(--dm-card)",
    color: on ? "#fff" : "var(--dm-text)",
  });
  const panelBtn = { flex: 1, minHeight: UI.touch, padding: "0 12px", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--dm-border)", background: "var(--dm-card)", color: "var(--dm-text)" };

  // 종목 입력 창 — 새 종목은 "＋ 종목 추가" 자리에, 수정은 그 종목 바로 아래에 (2026-11-07 사용자 요청: 맨 끝에 열려 안 보였다)
  const renderForm = (inline) => (
    <div ref={formRef} style={inline
      ? { marginTop: 10, padding: 12, borderRadius: 12, border: `1.5px solid ${ACCENT}`, background: "var(--dm-card)", scrollMarginBottom: 90 }
      : { ...S.card, marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)", marginBottom: 12 }}>
        {editingId ? "✏️ 종목 수정" : "＋ 종목 추가"}
      </div>

      {/* 프리셋 빠른 선택 */}
      {!editingId && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginBottom: 6 }}>빠른 선택</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRESET_ASSETS.map(p => (
              <button className={NL() ? 'dm-hit' : undefined} key={p.sym} onClick={() => pickPreset(p)}
                style={{
                  fontSize: NL() ? 14 : 12, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                  border: fSym === p.sym ? "1.5px solid #6C8EFF" : "1px solid var(--dm-border)",
                  background: fSym === p.sym ? "rgba(108,142,255,.12)" : "var(--dm-card)",
                  color: fSym === p.sym ? "#6C8EFF" : "var(--dm-text)", fontWeight: 700,
                }}>
                {p.sym}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginBottom: 4 }}>종목 이름</div>
            <input
              style={inputStyle}
              value={fLabel}
              onChange={e => setFLabel(e.target.value)}
              onFocus={() => { if (nameResults.length > 0) setShowNameResults(true); }}
              onBlur={() => setTimeout(() => setShowNameResults(false), 150)}
              placeholder="예: 삼성전자, 테슬라, 솔라나"
              maxLength={30}
            />
            {!editingId && showNameResults && (nameSearching || nameResults.length > 0) && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4,
                background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 12,
                boxShadow: "0 10px 28px rgba(0,0,0,.18)", maxHeight: 240, overflowY: "auto",
              }}>
                {nameSearching && (
                  <div style={{ padding: "10px 12px", fontSize: NL() ? 14 : 12, color: "var(--dm-muted)" }}>검색 중...</div>
                )}
                {!nameSearching && nameResults.map(r => (
                  <div
                    key={`${r.src}_${r.sym}`}
                    onMouseDown={() => pickSearchResult(r)}
                    style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid var(--dm-row)", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: NL() ? 14 : 12, fontWeight: 800, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                      <div style={{ fontSize: NL() ? 13 : 10, color: "var(--dm-muted)" }}>{r.sym} · {r.exchange}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginBottom: 4 }}>종목 코드 *</div>
            <input style={inputStyle} value={fSym} onChange={e => setFSym(e.target.value.toUpperCase())}
              placeholder="검색해서 선택하거나 직접 입력" maxLength={20} />
            {/^\d{6}$/.test(fSym.trim()) && (
              <div style={{ fontSize: NL() ? 13 : 10, color: "var(--dm-muted)", marginTop: 4 }}>
                한국 주식으로 인식했어요 (코스피 기준 .KS 자동 적용, 코스닥은 코드 뒤에 직접 .KQ를 붙여주세요)
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
          <div>
            <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginBottom: 4 }}>보유 수량 *</div>
            <input style={inputStyle} value={fQty} onChange={e => setFQty(e.target.value)}
              placeholder="예: 10" inputMode="decimal" />
          </div>
          <div>
            <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginBottom: 4 }}>평균매수가 *</div>
            <input style={inputStyle} value={fAvgPrice} onChange={e => setFAvgPrice(e.target.value)}
              placeholder="예: 250.00" inputMode="decimal" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
          <div>
            <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginBottom: 4 }}>통화</div>
            {fSrc !== 'yahoo' ? (
              <div style={{ fontSize: NL() ? 14 : 12, color: "var(--dm-sub)", padding: "8px 12px", background: "var(--dm-row)", borderRadius: 10, border: "1px solid var(--dm-border)" }}>
                USD 고정 (시세 통화)
              </div>
            ) : (
              <select style={{ ...inputStyle, appearance: "none" }} value={fCurrency} onChange={e => setFCurrency(e.target.value)}>
                <option value="KRW">KRW (원화)</option>
                <option value="USD">USD (달러)</option>
              </select>
            )}
          </div>
          {!PRESET_ASSETS.find(p => p.sym === fSym) && fSym && (
            <div>
              <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginBottom: 4 }}>데이터 소스</div>
              <select style={{ ...inputStyle, appearance: "none" }} value={fSrc} onChange={e => setFSrc(e.target.value)}>
                <option value="finnhub">미국 주식/ETF</option>
                <option value="coingecko">코인 (CoinGecko)</option>
                <option value="yahoo">한국 주식 (Yahoo)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={handleSave} style={{ ...S.btn, flex: 1 }}>
          {editingId ? "수정 저장" : "추가"}
        </button>
        <button onClick={resetForm} style={{ ...S.btnGhost, flex: 1 }}>취소</button>
      </div>
    </div>
  );

  const iconBtn = (color, size = 13) => ({ background: "transparent", border: "none", color, cursor: "pointer", fontSize: size, padding: "2px 4px" });

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <UndoBar bar={undo.bar} onUndo={undo.run} />

      {/* 상단바 */}
      <div style={S.topbar}>
        <button className={NL() ? 'dm-hit' : undefined} onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--dm-text)", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ flex: 1, marginLeft: 10 }}>
          <div style={S.title}>💼 보유자산</div>
          <div style={{ ...(NL() ? { ...S.sub, fontSize: UI.sub } : S.sub), wordBreak: "keep-all" }}>수량 · 단가 입력 후 평가손익 확인</div>
        </div>
        <button onClick={() => setPfHidden(!hidden)} aria-label={hidden ? "금액 보이기" : "금액 숨기기"} aria-pressed={hidden} title={hidden ? "금액 보이기" : "금액 숨기기"}
          style={{ width: UI.touch, height: UI.touch, padding: 0, background: hidden ? "rgba(91,124,250,.12)" : "transparent", border: "none", borderRadius: 10, color: "var(--dm-text)", fontSize: 18, cursor: "pointer", flexShrink: 0 }}>
          {hidden ? "🙈" : "👁"}
        </button>
        <button className={NL() ? 'dm-hit' : undefined}
          onClick={() => { localStorage.removeItem(cacheKey); setMarketData(null); fetchPrices(); }}
          style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 13, cursor: "pointer" }}
        >
          {loading ? "로딩 중..." : "🔄"}
        </button>
      </div>

      {/* 계좌 탭 (2026-11-07) — 탭 하나 = 포트폴리오 하나, ● 실계좌만 자산 브리핑에 쓴다 */}
      <div style={{ padding: `0 ${UI.gutter}px`, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
          {tabs.length > 1 && (
            <button onClick={() => { closeEditors(); setShowCompare(v => !v); }} aria-pressed={showCompare}
              style={chipStyle(showCompare)}>📊 비교</button>
          )}
          {tabs.map(t => (
            <button key={t.id} onClick={() => selectTab(t.id)} aria-pressed={!showCompare && t.id === activeTab.id}
              style={chipStyle(!showCompare && t.id === activeTab.id)}>
              {t.real && <span style={{ color: !showCompare && t.id === activeTab.id ? "#fff" : ACCENT, marginRight: 4 }}>●</span>}{t.name}
            </button>
          ))}
          {tabs.length < PF_MAX_TABS && (
            <button onClick={() => { setShowCompare(false); setPanel(panel === "add" ? null : "add"); }} aria-label="계좌 추가" aria-expanded={panel === "add"}
              style={{ ...chipStyle(false), width: UI.touch, padding: 0, color: ACCENT, fontSize: 18 }}>＋</button>
          )}
        </div>

        {!showCompare && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.5, wordBreak: "keep-all" }}>
              {activeTab.real
                ? <><b style={{ color: ACCENT }}>● 실계좌</b> · 자산 브리핑 기준</>
                : <><b>비교용</b> · 자산 브리핑에 안 들어가요</>}
              {activeTab.updatedAt ? ` · 마지막 저장 ${fmtSaved(activeTab.updatedAt)}` : ""}
            </div>
            <button onClick={() => { setPanel(panel === "menu" ? null : "menu"); setRenameDraft(activeTab.name); }}
              aria-label="계좌 메뉴" aria-expanded={panel === "menu"}
              style={{ flexShrink: 0, width: UI.touch, height: UI.touch, padding: 0, borderRadius: 10, border: "1px solid var(--dm-border)", background: panel === "menu" ? "rgba(91,124,250,.12)" : "var(--dm-card)", color: "var(--dm-text)", fontSize: 18, fontWeight: 900, cursor: "pointer" }}>⋯</button>
          </div>
        )}

        {panel === "add" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <button onClick={() => createTab(activeTab.id)} style={{ ...panelBtn, color: ACCENT, border: `1.5px solid ${ACCENT}` }}>⧉ "{activeTab.name}" 복사해서 만들기</button>
            <button onClick={() => createTab(null)} style={panelBtn}>＋ 빈 계좌 만들기</button>
          </div>
        )}

        {panel === "menu" && !showCompare && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid var(--dm-border)", background: "var(--dm-card)" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={renameDraft} onChange={e => setRenameDraft(e.target.value)} maxLength={20} placeholder="계좌 이름" aria-label="계좌 이름"
                onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) saveRename(); }}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
              <button onClick={saveRename} disabled={!renameDraft.trim() || renameDraft.trim() === activeTab.name}
                style={{ ...panelBtn, flex: "none", opacity: !renameDraft.trim() || renameDraft.trim() === activeTab.name ? 0.5 : 1 }}>이름 바꾸기</button>
            </div>
            {!activeTab.real && (
              <button onClick={setAsReal} style={{ ...panelBtn, color: ACCENT, border: `1.5px solid ${ACCENT}` }}>● 실계좌로 (자산 브리핑 기준으로 쓰기)</button>
            )}
            {!activeTab.real ? (
              <button onClick={deleteTab} style={{ ...panelBtn, color: "#EF4444", border: "1px solid rgba(239,68,68,.4)" }}>🗑 이 계좌 삭제</button>
            ) : (
              <div style={{ fontSize: 13, color: "var(--dm-muted)", lineHeight: 1.5, wordBreak: "keep-all" }}>
                실계좌는 지울 수 없어요. 다른 계좌를 실계좌로 바꾼 뒤 지울 수 있어요.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 계좌 비교 — 지금 시세로 계산 */}
      {showCompare && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)" }}>계좌 비교</div>
            {usdKrwRate && (
              <div style={{ display: "flex", gap: 4 }}>
                {["USD", "KRW"].map(cur => (
                  <button key={cur} className="dm-hit" onClick={() => setDisplayCurrencyPersist(cur)}
                    style={{ fontSize: 13, fontWeight: 800, padding: "2px 8px", borderRadius: 6, cursor: "pointer",
                      border: `1px solid ${displayCurrency === cur ? "#6C8EFF" : "var(--dm-border)"}`,
                      background: displayCurrency === cur ? "rgba(108,142,255,.14)" : "transparent",
                      color: displayCurrency === cur ? "#6C8EFF" : "var(--dm-muted)" }}>{cur}</button>
                ))}
              </div>
            )}
          </div>
          {compareRows.map((r, i) => (
            <button key={r.id} onClick={() => selectTab(r.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 0", background: "none", border: "none", borderTop: i ? "1px solid var(--dm-row)" : "none", borderRadius: 0, textAlign: "left", color: "var(--dm-text)", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.real && <span style={{ color: ACCENT, marginRight: 4 }}>●</span>}{r.name}
                </div>
                <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 2 }}>
                  {r.real ? "실계좌" : "비교용"} · {r.count}종목{r.updatedAt ? ` · ${fmtSaved(r.updatedAt)}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {r.stats ? (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 900 }}>{money(r.stats.value, displayCurrency)}</div>
                    <div style={{ fontSize: 13, color: pnlColor(r.stats.pnl) }}>{fmtPct(r.stats.pnlPct)}</div>
                    {!r.real && realStats && (
                      <div style={{ fontSize: 13, color: pnlColor(r.stats.value - realStats.value) }}>
                        실계좌보다 {hidden ? (r.stats.value >= realStats.value ? "+" : "-") + MASK : fmtSigned(r.stats.value - realStats.value, displayCurrency)}
                      </div>
                    )}
                    {r.whatIf != null && (
                      <div style={{ fontSize: 13, color: "var(--dm-sub)" }}>
                        그날 QQQ였다면 {money(r.whatIf, displayCurrency)}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--dm-muted)" }}>{r.count ? "시세 없음" : "종목 없음"}</div>
                )}
              </div>
            </button>
          ))}
          <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 8, lineHeight: 1.5, wordBreak: "keep-all" }}>
            모든 계좌를 오늘 시세로 계산해요. 복사해 둔 계좌로 "그대로 뒀다면 지금 얼마인지" 볼 수 있어요. "그날 QQQ였다면"은 복사한 날 총액을 나스닥100(QQQ)에 넣었다고 친 값이에요(2026.11.07 이후 복사한 계좌만).
          </div>
        </div>
      )}

      {!showCompare && (<>
      {/* 포트폴리오 요약 */}
      {summary && stats && (
        <div style={{ ...S.card, marginBottom: 10, background: "var(--dm-card)" }}>
          {stats.value > 0 || stats.cost > 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)" }}>총 평가금액</span>
                    {summary.fxOk && (
                      <div style={{ display: "flex", gap: 2 }}>
                        {["USD", "KRW"].map(cur => (
                          <button key={cur} onClick={() => setDisplayCurrencyPersist(cur)}
                            style={{
                              fontSize: NL() ? 13 : 10, fontWeight: 800, padding: "2px 6px", borderRadius: 6, cursor: "pointer",
                              border: `1px solid ${displayCurrency === cur ? "#6C8EFF" : "var(--dm-border)"}`,
                              background: displayCurrency === cur ? "rgba(108,142,255,.14)" : "transparent",
                              color: displayCurrency === cur ? "#6C8EFF" : "var(--dm-muted)",
                            }}>{cur}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "var(--dm-text)" }}>{money(stats.value, displayCurrency)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginBottom: 4 }}>오늘 변동</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: pnlColor(stats.dailyChange) }}>
                    {hidden ? MASK : <>{stats.dailyChange >= 0 ? "+" : ""}{fmtPrice(stats.dailyChange, displayCurrency)}</>}
                  </div>
                  <div style={{ fontSize: NL() ? 14 : 12, color: pnlColor(stats.dailyChangePct) }}>{fmtPct(stats.dailyChangePct)}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, paddingTop: 10, borderTop: "1px solid var(--dm-row)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)" }}>투자원금</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dm-text)" }}>{money(stats.cost, displayCurrency)}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)" }}>평가손익</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: pnlColor(stats.pnl) }}>
                    {hidden ? "" : <>{stats.pnl >= 0 ? "+" : ""}{fmtPrice(stats.pnl, displayCurrency)} </>}({fmtPct(stats.pnlPct)})
                  </div>
                </div>
              </div>
            </>
          ) : null}
          {summary.mixed && (
            <div style={{ display: "flex", gap: 12, paddingTop: 10, marginTop: 10, borderTop: "1px solid var(--dm-row)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)" }}>달러자산</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dm-text)" }}>{money(summary.usdNative.value, "USD")}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)" }}>원화자산</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dm-text)" }}>{money(summary.krwNative.value, "KRW")}</div>
              </div>
            </div>
          )}
          {stats.cash > 0 && (
            <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 8 }}>총 평가금액에 현금 {money(stats.cash, displayCurrency)} 포함 · 손익률은 종목 기준</div>
          )}
          {alloc && alloc.parts.length > 0 && (
            <div style={{ paddingTop: 12, marginTop: 10, borderTop: "1px solid var(--dm-row)" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--dm-sub)", marginBottom: 8 }}>자산 비중</div>
              <AllocationBar parts={alloc.parts} hidden={hidden} fmt={(v) => fmtPrice(v, displayCurrency)} />
              {!alloc.ok && <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 6 }}>환율을 못 받아 일부 금액이 빠졌어요</div>}
            </div>
          )}
          {summary.mixed && (
            <div style={{ fontSize: NL() ? 13 : 10, color: "var(--dm-muted)", marginTop: 6 }}>
              {summary.fxOk
                ? `현재 환율(1 USD ≈ ${fmtNum(usdKrwRate, 0)}원) 기준으로 환산해 총 평가금액에 반영했습니다`
                : "환율 조회 실패로 두 자산이 총 평가금액에 정확히 합산되지 않았습니다"}
            </div>
          )}
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div style={{ textAlign: "center", fontSize: NL() ? 14 : 12, color: "var(--dm-muted)", padding: "12px 0" }}>
          시세 불러오는 중...
        </div>
      )}

      {/* 보유 종목 리스트 — 같은 종목이 여러 앱에 있으면 한 줄로 합쳐 보여 준다 */}
      {holdings.length > 0 && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          {(summary ? summary.rows : rows).map((h, i, arr) => {
            const memos = h.memos || [];
            const memoOpen = memoOpenId === h.id;
            const parts = h.parts || [h];
            const multi = parts.length > 1;
            const expanded = multi && expandId === h.id;
            const editHere = showForm && editingId && !multi && parts[0].id === editingId;
            return (
              <div key={h.id} style={{
                padding: "10px 0",
                borderBottom: i < arr.length - 1 ? "1px solid var(--dm-row)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{h.label || h.sym}</span>
                      <span style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)" }}>{h.sym}{!multi && h.broker ? ` · ${h.broker}` : ""}</span>
                    </div>
                    <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)", marginTop: 2 }}>
                      {qtyText(h.qty)}주 · 매수가 {fmtPrice(h.avgPrice, h.currency)}
                      {!h.noData && h.price != null && (
                        <> · 현재 {fmtPrice(h.price, h.marketCurrency || 'USD')}</>
                      )}
                    </div>
                    {multi && (
                      <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-sub)", marginTop: 2 }}>
                        {parts.map(p => `${p.broker || "직접 입력"} ${qtyText(p.qty)}`).join(" · ")}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {!h.noData && h.value != null ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{money(h.value, h.marketCurrency || 'USD')}</div>
                        <div style={{ fontSize: NL() ? 13 : 11, color: pnlColor(h.pnl) }}>
                          {hidden ? "" : <>{h.pnl >= 0 ? "+" : ""}{fmtPrice(h.pnl, h.marketCurrency || 'USD')} </>}({fmtPct(h.pnlPct)})
                        </div>
                      </>
                    ) : h.currencyMismatch ? (
                      <div style={{ fontSize: NL() ? 13 : 11, color: "#F87171", lineHeight: 1.5 }}>통화 불일치<br/>USD로 재입력</div>
                    ) : (
                      <div style={{ fontSize: NL() ? 13 : 11, color: "var(--dm-muted)" }}>시세 없음</div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                    <button className={NL() ? 'dm-hit-x' : undefined} aria-label="메모"
                      onClick={() => { setMemoOpenId(memoOpen ? null : h.id); setMemoDraft(""); }}
                      style={{ ...iconBtn(memos.length > 0 ? "#6C8EFF" : "var(--dm-muted)", NL() ? 14 : 12), fontWeight: 800 }}
                    >
                      📝{memos.length > 0 ? ` ${memos.length}` : ""}
                    </button>
                    {multi ? (
                      // 여러 앱에 나뉜 종목은 앱별 줄을 펼쳐서 고친다 (한 줄을 통째로 지우지 않게 🗑는 앱별 줄에만)
                      <button className={NL() ? 'dm-hit-x' : undefined} aria-label="앱별로 고치기" aria-expanded={expanded}
                        onClick={() => { resetForm(); setExpandId(expanded ? null : h.id); }}
                        style={iconBtn(expanded ? ACCENT : "var(--dm-muted)")}>✏️</button>
                    ) : (<>
                      <button className={NL() ? 'dm-hit-x' : undefined} aria-label="수정" onClick={() => editHere ? resetForm() : handleEdit(parts[0])}
                        style={iconBtn("var(--dm-muted)")}>✏️</button>
                      <button className={NL() ? 'dm-hit-x' : undefined} aria-label="삭제" onClick={() => handleDelete(parts[0].id)}
                        style={iconBtn("#F87171")}>🗑</button>
                    </>)}
                  </div>
                </div>

                {editHere && renderForm(true)}

                {expanded && (
                  <div style={{ marginTop: 10, borderRadius: 12, background: "var(--dm-input)", padding: "4px 12px" }}>
                    {parts.map((p, pi) => (
                      <div key={p.id} style={{ padding: "8px 0", borderTop: pi ? "1px solid var(--dm-row)" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--dm-text)" }}>
                            <b>{p.broker || "직접 입력"}</b>
                            <span style={{ color: "var(--dm-muted)", fontSize: 13 }}> · {qtyText(p.qty)}주 · 매수가 {fmtPrice(p.avgPrice, p.currency)}</span>
                          </div>
                          <button className={NL() ? 'dm-hit-y' : undefined} aria-label={`${p.broker || "직접 입력"} 수정`}
                            onClick={() => (showForm && editingId === p.id) ? resetForm() : handleEdit(p)}
                            style={{ ...iconBtn("var(--dm-muted)"), width: 36 }}>✏️</button>
                          <button className={NL() ? 'dm-hit-y' : undefined} aria-label={`${p.broker || "직접 입력"} 삭제`}
                            onClick={() => handleDelete(p.id)}
                            style={{ ...iconBtn("#F87171"), width: 36 }}>🗑</button>
                        </div>
                        {showForm && editingId === p.id && renderForm(true)}
                      </div>
                    ))}
                  </div>
                )}

                {memoOpen && (
                  <div style={{ marginTop: 10 }}>
                    {memos.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                        {[...memos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(m => (
                          <div key={m.id} style={{ background: "var(--dm-input)", borderRadius: 10, padding: "8px 10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontSize: NL() ? 14 : 12, color: "var(--dm-text)", lineHeight: 1.5, flex: 1 }}>{m.text}</div>
                              <button onClick={() => handleDeleteMemo(m._hid || parts[0].id, m.id)}
                                style={{ background: "transparent", border: "none", color: "var(--dm-muted)", cursor: "pointer", fontSize: NL() ? 13 : 11, flexShrink: 0 }}>✕</button>
                            </div>
                            <div style={{ fontSize: NL() ? 13 : 10, color: "var(--dm-muted)", marginTop: 4 }}>{formatMemoDate(m.createdAt)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={memoDraft}
                        onChange={(e) => setMemoDraft(e.target.value)}
                        placeholder="메모 남기기..."
                        maxLength={200}
                        style={{ ...S.input, marginBottom: 0, flex: 1 }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddMemo(parts[0].id); }}
                      />
                      <button onClick={() => handleAddMemo(parts[0].id)} style={{ ...S.btnGhost, width: "auto", marginTop: 0, padding: "0 14px", flexShrink: 0 }}>추가</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 💵 현금 (2026-11-07) — 총 평가금액·비중에 더한다. 실계좌 현금은 자산 브리핑에도 */}
      <div style={{ ...S.card, marginBottom: 10 }}>
        {cashEdit ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "var(--dm-text)", marginBottom: 10 }}>💵 현금</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
              <label style={{ fontSize: 13, color: "var(--dm-muted)" }}>원화
                <input value={cashEdit.krw} onChange={e => setCashEdit(c => ({ ...c, krw: e.target.value }))} inputMode="numeric" placeholder="예: 5,000,000" style={{ ...inputStyle, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, color: "var(--dm-muted)" }}>달러
                <input value={cashEdit.usd} onChange={e => setCashEdit(c => ({ ...c, usd: e.target.value }))} inputMode="decimal" placeholder="예: 2,000" style={{ ...inputStyle, marginTop: 4 }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={saveCash} style={{ ...S.btn, flex: 1, marginTop: 0 }}>저장</button>
              <button onClick={() => setCashEdit(null)} style={{ ...S.btnGhost, flex: 1, marginTop: 0 }}>취소</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCashEdit({ krw: cash?.krw ? String(cash.krw) : "", usd: cash?.usd ? String(cash.usd) : "" })}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: UI.touch, padding: 0, background: "none", border: "none", textAlign: "left", color: "var(--dm-text)", cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 14, fontWeight: 900 }}>💵 현금</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: cash ? "var(--dm-text)" : "var(--dm-muted)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {cash ? [cash.krw ? money(cash.krw, "KRW") : null, cash.usd ? money(cash.usd, "USD") : null].filter(Boolean).join(" · ") : "예수금·달러 넣기"}
            </span>
            <span aria-hidden style={{ fontSize: 13 }}>✏️</span>
          </button>
        )}
      </div>

      {holdings.length === 0 && !showForm && !cash && (
        <div style={{ ...S.card, textAlign: "center", color: "var(--dm-muted)", fontSize: 13, padding: "28px 16px" }}>
          보유 종목을 추가해보세요<br />
          <span style={{ fontSize: NL() ? 13 : 11, marginTop: 6, display: "block" }}>수량과 평균단가를 입력하면<br />평가금액과 손익을 자동 계산해요</span>
        </div>
      )}

      {/* 추가 버튼 */}
      {!(showForm && !editingId) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, ...(NL() ? { padding: `0 ${UI.gutter}px` } : {}) }}>
          <button onClick={() => { resetForm(); setExpandId(null); setShowForm(true); }} style={{ ...S.btn, flex: 1, marginTop: 0 }}>
            ＋ 종목 추가
          </button>
          <button onClick={() => authUser ? setShowScan(true) : setToast("로그인 후 쓸 수 있어요")}
            style={{ ...S.btnGhost, flex: 1, marginTop: 0 }}>
            📷 캡처로 업데이트
          </button>
        </div>
      )}

      {showScan && (
        <HoldingsScanSheet holdings={holdings} usdKrwRate={usdKrwRate}
          onApply={handleScanApply} onClose={() => setShowScan(false)} />
      )}

      {/* 새 종목 입력 창 (수정 창은 그 종목 바로 아래에 열린다) */}
      {showForm && !editingId && renderForm(false)}

      {/* 📈 자산 추이 — 실계좌만 (앱을 연 날 하루 한 점) */}
      {activeTab.real && (holdings.length > 0 || cash) && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)" }}>📈 자산 추이</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[[30, "1달"], [90, "3달"], [365, "1년"], [null, "전체"]].map(([d, l]) => (
                <button key={l} className="dm-hit-y" onClick={() => setTrendRange(d)} aria-pressed={trendRange === d}
                  style={{ height: 30, padding: "0 8px", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                    border: `1px solid ${trendRange === d ? ACCENT : "var(--dm-border)"}`, background: trendRange === d ? "rgba(91,124,250,.12)" : "transparent", color: trendRange === d ? ACCENT : "var(--dm-sub)" }}>{l}</button>
              ))}
            </div>
          </div>
          {trend.length >= 2 && (() => {
            const a = trend[0].v, b = trend[trend.length - 1].v, pct = ((b - a) / a) * 100;
            return (
              <div style={{ fontSize: 13, color: "var(--dm-sub)", marginBottom: 8 }}>
                {trend.length}일 기록 · <b style={{ color: pnlColor(pct) }}>{hidden ? "" : fmtSigned(b - a, displayCurrency) + " "}({fmtPct(pct)})</b>
              </div>
            );
          })()}
          <TrendChart series={trend} hidden={hidden} fmt={(v) => fmtPrice(v, displayCurrency)} />
        </div>
      )}

      {/* 💰 배당 (예상) — Yahoo 배당 기록(지난 1년)으로 앞으로 1년 */}
      {div && div.perHolding.length > 0 && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)" }}>💰 예상 배당 (1년)</div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)" }}>{money(divPre.sum, displayCurrency)}</div>
              <div style={{ fontSize: 13, color: "var(--dm-sub)" }}>세후 약 {money(divPost.sum, displayCurrency)}{divYield != null ? ` · 연 ${divYield.toFixed(2)}%` : ""}</div>
            </div>
          </div>
          <DividendMonths months={divMonths} hidden={hidden} fmt={(v) => fmtPrice(v, displayCurrency)} />
          {divSoon.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--dm-sub)", marginBottom: 4 }}>다가오는 배당락일 (예상)</div>
              {divSoon.map(e => (
                <div key={e.d + e.sym} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid var(--dm-row)", fontSize: 14, color: "var(--dm-text)" }}>
                  <span style={{ width: 48, flexShrink: 0, fontWeight: 800, color: "var(--dm-sub)" }}>{Number(e.d.slice(5, 7))}/{Number(e.d.slice(8))}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
                  <span style={{ flexShrink: 0, fontWeight: 800 }}>{money(e.amount, e.currency)}</span>
                </div>
              ))}
              {(divUpcomingCount > 3 || div.perHolding.length > 0) && (
                <button onClick={() => setDivOpen(v => !v)} style={{ display: "block", width: "100%", minHeight: UI.touch, padding: 0, background: "none", border: "none", borderTop: "1px solid var(--dm-row)", borderRadius: 0, fontSize: 14, fontWeight: 800, color: ACCENT, cursor: "pointer", fontFamily: "inherit" }}>
                  {divOpen ? "접기 ▲" : "모두 보기 · 종목별 ▼"}
                </button>
              )}
            </div>
          )}
          {divOpen && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--dm-sub)", marginBottom: 4 }}>종목별 (1년)</div>
              {div.perHolding.map(p => (
                <div key={p.sym + p.currency} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid var(--dm-row)", fontSize: 14, color: "var(--dm-text)" }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label} <span style={{ fontSize: 13, color: "var(--dm-muted)" }}>연 {p.count}회</span></span>
                  <span style={{ flexShrink: 0, fontWeight: 800 }}>{money(p.annual, p.currency)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 10, lineHeight: 1.6, wordBreak: "keep-all" }}>
            지난 1년 배당을 그대로 이어 간다고 보고 계산했어요. 날짜는 배당락일 기준이고 실제 입금은 보통 몇 주 뒤예요. 세후는 원천징수(국내 15.4%·미국 15%)만 뺀 대략값이에요.
          </div>
        </div>
      )}
      </>)}

      {/* 제작자가 만든 코인 시장 분석 앱 — 새 창(외부 브라우저)으로 연다 */}
      <a href="https://altseason-lab.vercel.app/" target="_blank" rel="noopener noreferrer"
        style={{ ...S.card, marginTop: 6, marginBottom: 10, display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "var(--dm-text)" }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(108,142,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>📡</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>알트 시즌 레이더</div>
          <div style={{ fontSize: NL() ? 14 : 12, color: "var(--dm-sub)", marginTop: 2 }}>알트코인 사이클·상대 강도 분석</div>
          <div style={{ fontSize: NL() ? 13 : 10, color: "var(--dm-muted)", marginTop: 3 }}>투자 참고용 분석이에요</div>
        </div>
        <span style={{ fontSize: 16, color: "var(--dm-muted)", flexShrink: 0 }}>↗</span>
      </a>

      <div style={{ height: 40 }} />
    </div>
  );
}
