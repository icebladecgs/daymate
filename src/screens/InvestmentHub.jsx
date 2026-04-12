import { useEffect, useState } from "react";
import S from "../styles.js";
import Portfolio from "./Portfolio.jsx";
import InvestDiary from "./InvestDiary.jsx";

const TAB_META = {
  briefing: {
    icon: "💼",
    label: "자산 브리핑",
    desc: "보유자산 · 손익 · 시세",
  },
  diary: {
    icon: "✍️",
    label: "투자 기록",
    desc: "판단 기록 · 복기",
  },
};

export default function InvestmentHub({ uid, telegramCfg, setTelegramCfg, authUser, onBack, initialTab = "briefing" }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [diaryDraft, setDiaryDraft] = useState(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const openDiary = (draft = null) => {
    setDiaryDraft({ requestedAt: Date.now(), ...(draft || {}) });
    setActiveTab("diary");
  };

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <button onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--dm-text)", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
          <div>
            <div style={S.title}>📊 투자 허브</div>
            <div style={S.sub}>브리핑 확인 후 바로 판단을 기록하고 복기하세요</div>
          </div>
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)", marginBottom: 6 }}>
          정보와 기록을 한 흐름으로 묶었습니다
        </div>
        <div style={{ fontSize: 12, color: "var(--dm-muted)", lineHeight: 1.6 }}>
          자산 상황을 보고, 그 자리에서 바로 투자 판단을 남기고, 나중에 같은 흐름 안에서 복기할 수 있습니다.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "0 16px 12px" }}>
        {Object.entries(TAB_META).map(([key, meta]) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              style={{
                borderRadius: 18,
                border: `1.5px solid ${active ? "rgba(108,142,255,.36)" : "var(--dm-border)"}`,
                background: active
                  ? "linear-gradient(135deg,rgba(108,142,255,.16),rgba(167,139,250,.12))"
                  : "var(--dm-card)",
                color: "var(--dm-text)",
                padding: "14px 12px",
                textAlign: "left",
                cursor: "pointer",
                boxShadow: active ? "0 10px 28px rgba(108,142,255,.12)" : "none",
              }}
            >
              <div style={{ fontSize: 18, marginBottom: 8 }}>{meta.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 900 }}>{meta.label}</div>
              <div style={{ fontSize: 11, color: active ? "var(--dm-sub)" : "var(--dm-muted)", marginTop: 4 }}>{meta.desc}</div>
            </button>
          );
        })}
      </div>

      {activeTab === "briefing" ? (
        <Portfolio
          uid={uid}
          telegramCfg={telegramCfg}
          setTelegramCfg={setTelegramCfg}
          authUser={authUser}
          embedded
          onOpenDiary={openDiary}
        />
      ) : (
        <InvestDiary
          uid={uid}
          telegramCfg={telegramCfg}
          embedded
          diaryDraft={diaryDraft}
          onOpenBriefing={() => setActiveTab("briefing")}
        />
      )}
    </div>
  );
}