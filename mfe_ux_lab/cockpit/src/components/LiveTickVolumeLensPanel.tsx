// LiveTickVolumeLensPanel — LIVE view của live_tickvol_lens L2 (observer · OBSERVE_ONLY · forward-only).
// KHÔNG auto-poll khi mount — bắt buộc bấm nút "Bắt đầu thu" trước (giống Mt5ConnectPanel yêu cầu Connect).
// Hiện trạng thái collector + số mẫu + Value Area live. Nhãn honesty HIỂN THỊ: tick-volume = số lần đổi giá MT5,
// KHÔNG phải khối lượng sàn khớp lệnh thật; chỉ có dữ liệu từ lúc bấm bắt đầu (forward-only).
import { useMemo, useRef, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import { mt5Bar } from "../lib/mt5DemoAdapter.ts";
import { createTickVolumeCollector, type TickVolumeCollector, type PollResult } from "../lib/liveTickVolumeCollector.ts";

// ── PURE LOGIC (export để harness test không cần JSX) ──
export interface LensGateState { started: boolean; polling: boolean }
/** shouldPoll: CHỈ được poll khi đã bấm bắt đầu và không đang poll dở. Chưa bấm → false (không auto-poll). */
export function shouldPoll(s: LensGateState): boolean { return s.started && !s.polling; }

const HONEST_CAPTION = "MT5 tick volume counts price updates. It is not matched exchange volume and is collected only after explicitly starting.";

export function LiveTickVolumeLensPanel({ tf = "M15" }: { tf?: string }) {
  const [started, setStarted] = useState(false);
  const [polling, setPolling] = useState(false);
  const [last, setLast] = useState<PollResult | null>(null);
  const [count, setCount] = useState(0);
  const [va, setVa] = useState<{ poc: number; vah: number; val: number } | null>(null);
  const collectorRef = useRef<TickVolumeCollector | null>(null);

  const collector = useMemo(() => {
    // production: fetchBar = mt5Bar(symbol, tf) qua endpoint sẵn có; throttle mặc định 20s
    const c = createTickVolumeCollector({ symbol: getActiveSymbol(), tf, fetchBar: () => mt5Bar(getActiveSymbol(), tf), storage: typeof localStorage !== "undefined" ? localStorage : null, ns: "lens" });
    collectorRef.current = c; return c;
  }, [tf]);

  async function poll() {
    if (!shouldPoll({ started: true, polling })) return;
    setPolling(true);
    try {
      const r = await collector.pollOnce();
      setLast(r);
      const s = collector.samples(); setCount(s.length);
      setVa(collector.liveValueArea(1));   // atr=1 minh họa (đơn vị bin proxy); descriptive
    } finally { setPolling(false); }
  }

  function start() { setStarted(true); poll(); }

  const statusColor = last?.status === "OK" ? TK.green : last?.status === "NO_LIVE_VOLUME" ? "#f7768e" : TK.muted;

  return (
    <div className="pc" style={{ marginTop: 12, borderColor: "#1c4a5b" }}>
      <div className="pc-h cyan"> Live Tick-Volume Lens <span className="mut">L2 · observer · {tf} Forward-only descriptive observation</span></div>
      <div className="pmut psm" style={{ marginBottom: 8, color: "#e3a23a" }}>⚠ {HONEST_CAPTION}</div>
      {!started ? (
        <button onClick={start} style={{ background: "#0b141e", border: "1px solid #2f81f7", borderRadius: 7, color: TK.cyan, padding: "6px 14px", fontSize: 12.5, cursor: "pointer" }}>
           Start tick-volume collection
        </button>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 11.5, fontFamily: "var(--mfe-mono)", marginBottom: 8 }}>
            <span>status: <b style={{ color: statusColor }}>{last?.skipped ?? last?.status ?? "…"}</b></span>
            <span className="pmut">collected samples: {count}</span>
            <button onClick={poll} disabled={polling} style={{ marginLeft: "auto", background: "#0b141e", border: "1px solid var(--mfe-border)", borderRadius: 6, color: TK.cyan, padding: "3px 10px", fontSize: 11, cursor: polling ? "default" : "pointer", opacity: polling ? 0.6 : 1 }}>
              {polling ? "Collecting…" : "Collect more samples"}
            </button>
          </div>
          {last?.reason && last.status === "NO_LIVE_VOLUME" && (
            <div className="pmut psm" style={{ color: "#f7768e", marginBottom: 8 }}>NO_LIVE_VOLUME — {last.reason} No missing value is synthesized</div>
          )}
          {va ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1px 16px", borderTop: "1px solid #14202c", paddingTop: 7, fontFamily: "var(--mfe-mono)" }}>
              <div className="pkv"><span>VAL</span><b>{va.val.toFixed(2)}</b></div>
              <div className="pkv"><span>POC</span><b style={{ color: TK.cyan }}>{va.poc.toFixed(2)}</b></div>
              <div className="pkv"><span>VAH</span><b>{va.vah.toFixed(2)}</b></div>
            </div>
          ) : (
            <div className="pmut psm">At least twenty samples are required to estimate this value area.</div>
          )}
          <div className="pfoot" style={{ marginTop: 8 }}>Forward-only tick-volume proxy. Not actual order flow or an entry instruction.</div>
        </>
      )}
    </div>
  );
}
