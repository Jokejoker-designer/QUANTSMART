// liveTickVolumeCollector — TICK_VOLUME_PROXY / OBSERVE_ONLY / DATA_LAYER (WO: MFE_COCKPIT_LIVE_TICKVOLUME_COLLECTOR_WO_V1, P4-lite)
//
// Thu thập tick-volume LIVE (forward-only, từ lúc polling bắt đầu — KHÔNG có lịch sử trước đó) qua endpoint
// /mt5/bar sẵn có (mt5Bar), nuôi Value Area live qua buildVolumeHistogram (P2). Nhãn TICK_VOLUME_PROXY:
//   • tick_volume của MT5 = SỐ LẦN GIÁ ĐỔI trong nến, KHÔNG phải khối lượng sàn khớp lệnh thật. Đây là proxy
//     của một proxy — P2 đã đo Value Area đếm-nến lệch Value Area volume-thật ~1.4–1.9 ATR; tick-volume còn xa
//     hơn một bước so với volume sàn thật. Tuyệt đối KHÔNG mô tả như dữ liệu dòng-lệnh/khối-lượng sàn có thật.
//   • forward-only: /mt5/history không mang volume nên KHÔNG backfill lịch sử (cần sửa bridge Python — WO khác).
// OBSERVE_ONLY: KHÔNG code path trigger/entry/exit/score nào đọc collector này (guard bởi harness). Fail-closed:
// bridge offline HOẶC bar thiếu tick_volume → NO_LIVE_VOLUME (phân biệt rõ với volume=0 THẬT).
import { isOffline, type Offline } from "./signatureClient.ts";
import type { Mt5LiveBar } from "./mt5DemoAdapter.ts";
import { buildVolumeHistogram } from "./volumeTruthCalibration.ts";

export const RING_MAX = 6000;          // bounded ring (giống MAX_EXT của marketDataSync — quota-safe)
const DEFAULT_THROTTLE_MS = 20000;     // ≥ MIN_SYNC_MS: không poll quá 1 lần / 20s dù caller gọi dồn

export interface LiveVolSample { t: string; c: number; vol: number }
export type PollStatus = "OK" | "NO_LIVE_VOLUME" | "THROTTLED" | "IN_FLIGHT";
export interface PollResult { status?: PollStatus; skipped?: "THROTTLED" | "IN_FLIGHT"; added: number; reason?: string }

// storage tối thiểu — production truyền localStorage, test truyền mem store (DI, testable không cần trình duyệt)
interface KVStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
type FetchBar = () => Promise<Mt5LiveBar | { bar: null; reason: string } | Offline>;

export interface CollectorOpts {
  symbol: string; tf: string;
  fetchBar: FetchBar;                  // DI: production = () => mt5Bar(sym, tf); test = mock
  storage?: KVStore | null;            // null = không persist (chỉ RAM)
  ns?: string;                         // namespace key riêng (không đụng tape)
  throttleMs?: number;
}

// throttle/lock là module-level (khớp pattern autoSyncOnce) — reset được cho test.
let _lastPollMs = 0; let _inFlight = false;
export function __resetThrottleForTest(): void { _lastPollMs = 0; _inFlight = false; }

export interface TickVolumeCollector {
  pollOnce(): Promise<PollResult>;
  samples(): LiveVolSample[];
  liveValueArea(atr: number, mass?: number): { poc: number; vah: number; val: number } | null;
  _ingestForTest(bar: Mt5LiveBar): void;
}

export function createTickVolumeCollector(opt: CollectorOpts): TickVolumeCollector {
  const throttleMs = opt.throttleMs ?? DEFAULT_THROTTLE_MS;
  const key = `mfe_tickvol_${opt.ns ?? "live"}_${opt.symbol}_${opt.tf}`;
  let ring: LiveVolSample[] = load();

  function load(): LiveVolSample[] {
    if (!opt.storage) return [];
    try { const a = JSON.parse(opt.storage.getItem(key) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
  }
  function persist(): void { if (opt.storage) { try { opt.storage.setItem(key, JSON.stringify(ring)); } catch { /* quota — bỏ, không crash */ } } }

  // ingest 1 bar hợp lệ (đã biết tick_volume là số): dedup theo timestamp, bounded ring.
  function ingest(b: Mt5LiveBar): boolean {
    const vol = b.tick_volume;
    if (vol == null || !isFinite(vol)) return false;          // thiếu field → NO_LIVE_VOLUME (caller xử lý)
    const t = b.time;
    const last = ring[ring.length - 1];
    if (last && last.t === t) { last.c = b.close; last.vol = vol; }   // cùng timestamp → cập nhật (idempotent, không nhân đôi)
    else if (ring.some((s) => s.t === t)) { const s = ring.find((x) => x.t === t)!; s.c = b.close; s.vol = vol; }
    else ring.push({ t, c: b.close, vol });
    if (ring.length > RING_MAX) ring = ring.slice(-RING_MAX);
    persist();
    return true;
  }

  return {
    async pollOnce(): Promise<PollResult> {
      const now = Date.now();
      if (_inFlight) return { skipped: "IN_FLIGHT", added: 0 };
      if (now - _lastPollMs < throttleMs) return { skipped: "THROTTLED", added: 0 };
      _inFlight = true; _lastPollMs = now;
      try {
        const r = await opt.fetchBar();
        if (isOffline(r)) return { status: "NO_LIVE_VOLUME", added: 0, reason: r.error };
        if (!r || (r as { bar: null }).bar === null) return { status: "NO_LIVE_VOLUME", added: 0, reason: (r as { reason?: string })?.reason ?? "no bar" };
        const bar = r as Mt5LiveBar;
        if (bar.tick_volume == null || !isFinite(bar.tick_volume)) return { status: "NO_LIVE_VOLUME", added: 0, reason: "tick_volume missing" };
        const added = ingest(bar) ? 1 : 0;
        return { status: "OK", added };
      } catch (e) {
        return { status: "NO_LIVE_VOLUME", added: 0, reason: String(e) };   // lỗi mạng → fail-closed, không throw
      } finally {
        _inFlight = false;
      }
    },
    samples: () => ring,
    liveValueArea(atr: number, mass = 0.70) {
      if (ring.length < 20 || !(atr > 0)) return null;        // chưa đủ mẫu forward-only → không đoán
      const h = buildVolumeHistogram(ring, ring.length - 1, atr);
      const keys = [...h.counts.keys()]; if (!keys.length) return null;
      const minK = Math.min(...keys), maxK = Math.max(...keys);
      const w = (k: number) => h.counts.get(k) || 0;
      let upK = h.pocKey, dnK = h.pocKey, acc = w(h.pocKey); const target = mass * h.total;
      while (acc < target && (upK < maxK || dnK > minK)) {
        const uN = upK < maxK ? w(upK + 1) : -1, dN = dnK > minK ? w(dnK - 1) : -1;
        if (uN >= dN) { upK++; acc += Math.max(0, uN); } else { dnK--; acc += Math.max(0, dN); }
      }
      return { poc: h.pocKey * h.bin, vah: upK * h.bin, val: dnK * h.bin };
    },
    _ingestForTest(bar: Mt5LiveBar) { ingest(bar); },
  };
}
