// strategyWiring — CỬA CHẶN NỐI-CHÉO giữa các tầng (Pha D). Làm cho "các tầng thật-sự ảnh-hưởng lẫn nhau" chứ không
// nằm rời: 5 lớp cấm, mỗi cấm trả LÝ-DO đời-thường + ContributionMap (tầng nào DRIVES / FILTERS / INERT). ADDITIVE —
// KHÔNG nới validateModule/validateAst/validateGraph; chỉ kiểm khi NỐI các module đã-build thành một chiến-lược.
// Bắt đúng bẫy lặp trong phiên: evidence L1/L2/L3 không được TRIGGER/GATE nào đọc → INERT (đánh dấu TRƯỚC Microscope).

export type WiringLayer = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
export interface WiringModule {
  id: string; layer: WiringLayer; name: string;
  role?: string;                 // L4=CONTEXT_GATE · L5=TRIGGER/VETO/CONFIRM/EXIT · L6=ZONE
  refs: string[];                // id các module TẦNG DƯỚI mà module này đọc (L2.featureKeys · L3 ast inputs · L4/L5 metric=id · L6 anchor id)
  direction?: string;            // TRIGGER
  condCount?: number;            // số điều-kiện (L4/L5) — 0 = suy-biến
  flat?: boolean;                // (tuỳ chọn, từ preview) series đầu-ra phẳng → suy-biến
}
export interface StrategyChain { modules: WiringModule[] }

export type Severity = "BLOCK" | "WARN";
export interface WiringViolation { layer: number; code: string; severity: Severity; moduleId?: string; reason: string }
export type Contribution = "DRIVES" | "FILTERS" | "INERT";
export interface ContribRow { id: string; layer: WiringLayer; name: string; contribution: Contribution; reason: string }
export interface WiringResult { ok: boolean; violations: WiringViolation[]; contributionMap: ContribRow[]; hasTrigger: boolean }

const ORDER: Record<WiringLayer, number> = { L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, L6: 6 };
const EVIDENCE: WiringLayer[] = ["L1", "L2", "L3"];
const isEvidence = (l: WiringLayer) => EVIDENCE.includes(l);
// KIỂU PORT đầu-ra theo tầng (block port-typed): evidence xuất chuỗi SỐ · L4 xuất GATE · L5 xuất DECISION · L6 xuất ZONE.
type PortKind = "NUMBER" | "GATE" | "DECISION" | "ZONE";
const PORT_LABEL: Record<PortKind, string> = { NUMBER: "chuỗi số (evidence)", GATE: "cổng bật/tắt (L4)", DECISION: "trạng-thái quyết-định (L5)", ZONE: "vùng giá (L6)" };

export function validateStrategyWiring(chain: StrategyChain): WiringResult {
  const mods = chain.modules;
  const byId = new Map(mods.map((m) => [m.id, m]));
  const v: WiringViolation[] = [];

  // ai đọc ai (đảo ngược refs) — dùng cho lớp 4 (inert) + lớp 1/2 (nối hợp-lệ)
  const readBy = new Map<string, string[]>();
  for (const m of mods) for (const r of m.refs) { if (!readBy.has(r)) readBy.set(r, []); readBy.get(r)!.push(m.id); }

  // ── LỚP 1: XUÔI + KHÔNG CHU-TRÌNH — chỉ được đọc TẦNG DƯỚI (order nhỏ hơn); ref tới id không tồn tại = block ──
  for (const m of mods) for (const r of m.refs) {
    const t = byId.get(r);
    if (!t) { v.push({ layer: 1, code: "REF_MISSING", severity: "BLOCK", moduleId: m.id, reason: `${m.name} trỏ tới '${r}' chưa tồn tại — build module đó trước hoặc bỏ tham-chiếu.` }); continue; }
    if (ORDER[t.layer] >= ORDER[m.layer]) v.push({ layer: 1, code: "NOT_FORWARD", severity: "BLOCK", moduleId: m.id, reason: `${m.name} (${m.layer}) đọc '${t.name}' (${t.layer}) — chỉ được đọc TẦNG DƯỚI, không cùng/ngược tầng (dễ thành chu-trình).` });
  }
  // cycle (DFS trên đồ-thị refs)
  const seen = new Set<string>(), stack = new Set<string>();
  const dfs = (id: string): boolean => {
    if (stack.has(id)) return true; if (seen.has(id)) return false;
    seen.add(id); stack.add(id);
    for (const r of byId.get(id)?.refs ?? []) if (byId.has(r) && dfs(r)) return true;
    stack.delete(id); return false;
  };
  for (const m of mods) if (dfs(m.id)) { v.push({ layer: 1, code: "CYCLE", severity: "BLOCK", moduleId: m.id, reason: `Có CHU-TRÌNH tham-chiếu qua '${m.name}' — chuỗi phải xuôi một chiều L1→…→L6.` }); break; }

  // ── LỚP 2: KHỚP KIỂU — evidence (L1/L2/L3) mới được làm INPUT số; L4/L5 gate/trigger đọc evidence hoặc metric
  //   built-in; L6 anchor đọc L1/evidence/state. Ở đây: cấm module NON-evidence bị dùng làm ref-số của tầng trên. ──
  for (const m of mods) for (const r of m.refs) { const t = byId.get(r); if (t && !isEvidence(t.layer) && isEvidence(m.layer)) v.push({ layer: 2, code: "TYPE_MISMATCH", severity: "BLOCK", moduleId: m.id, reason: `${m.name} (${m.layer}) dùng '${t.name}' (${t.layer}) làm đầu-vào số — chỉ evidence L1/L2/L3 mới là chuỗi số.` }); }

  // ── LỚP 2b: KHỚP PORT (block port-typed — payoff "liên kết chặt") — mỗi ref phải đúng KIỂU PORT đầu-ra: context-gate
  //   L4 (GATE) chỉ nối vào ENTRY, KHÔNG làm số cho tầng khác · anchor L6 chỉ neo vào MỨC GIÁ (evidence) hoặc trạng-thái
  //   L5, KHÔNG neo vào GATE/ZONE · evidence (NUMBER) mới feed được input số. Nối sai port → BLOCK. ADDITIVE. ──
  const outPort = (t: WiringModule): PortKind => isEvidence(t.layer) ? "NUMBER" : t.layer === "L4" ? "GATE" : t.layer === "L5" ? "DECISION" : "ZONE";
  for (const m of mods) for (const r of m.refs) {
    const t = byId.get(r); if (!t) continue;                     // REF_MISSING đã bắt ở lớp 1
    if (isEvidence(m.layer) && !isEvidence(t.layer)) continue;   // đã bắt ở lớp 2 (TYPE_MISMATCH) — không báo trùng
    const tp = outPort(t);
    if (m.layer === "L6") {
      if (tp === "GATE" || tp === "ZONE") v.push({ layer: 2, code: "PORT_MISMATCH", severity: "BLOCK", moduleId: m.id, reason: `${m.name} (L6) neo vào '${t.name}' — nó xuất ra ${PORT_LABEL[tp]}, không phải MỨC GIÁ. Anchor chỉ neo được evidence (số) hoặc trạng-thái L5.` });
    } else if (tp !== "NUMBER") {
      v.push({ layer: 2, code: "PORT_MISMATCH", severity: "BLOCK", moduleId: m.id, reason: `${m.name} (${m.layer}) đọc '${t.name}' như một SỐ — nhưng '${t.name}' xuất ra ${PORT_LABEL[tp]}. Context-gate (L4) nối vào ENTRY, không làm số cho tầng khác; chỉ evidence L1/L2/L3 mới feed được input số.` });
    }
  }

  // ── LỚP 3: KHÔNG SUY-BIẾN (cấu-trúc) — L4/L5 executable phải có ≥1 điều-kiện; series phẳng (nếu preview báo) ──
  for (const m of mods) {
    if ((m.layer === "L4" || m.layer === "L5") && m.condCount === 0) v.push({ layer: 3, code: "NO_CONDITION", severity: "BLOCK", moduleId: m.id, reason: `${m.name} không có điều-kiện nào — sẽ không bao giờ kích-hoạt.` });
    if (m.flat) v.push({ layer: 3, code: "FLAT_OUTPUT", severity: "WARN", moduleId: m.id, reason: `${m.name} cho đầu-ra gần như PHẲNG trên nến thật — nghi hỏng/thừa (kiểm lại graph/công-thức).` });
  }

  // ── LỚP 4: TẦNG VÔ-ẢNH-HƯỞNG — evidence không được TRIGGER/GATE/VETO/L3 nào đọc → INERT (bẫy phiên này) ──
  const triggers = mods.filter((m) => m.layer === "L5" && m.role === "TRIGGER");
  const hasTrigger = triggers.length > 0;
  for (const m of mods) if (isEvidence(m.layer) && !(readBy.get(m.id)?.length)) v.push({ layer: 4, code: "INERT_EVIDENCE", severity: "WARN", moduleId: m.id, reason: `${m.name} (${m.layer}) không được tầng nào đọc — đang NGỒI KHÔNG (đóng-góp 0). Cho một TRIGGER/GATE đọc nó qua metric = id, hoặc bỏ khỏi card.` });
  if (!hasTrigger && mods.some((m) => m.layer === "L5" || m.layer === "L4")) v.push({ layer: 4, code: "NO_TRIGGER", severity: "WARN", reason: "Card KHÔNG có module role=TRIGGER — engine sẽ chạy EMA-cross mặc-định, mọi evidence/gate/confirm của bạn không lái được lệnh. Thêm ≥1 TRIGGER (có direction) đọc evidence." });

  // ── LỚP 5: AUTHORITY — evidence không được là executable role; L5 trigger cần direction; role hợp-lệ theo tầng ──
  const L5_ROLES = new Set(["TRIGGER", "VETO", "CONFIRM", "EXIT"]);
  for (const m of mods) {
    if (isEvidence(m.layer) && m.role && L5_ROLES.has(m.role)) v.push({ layer: 5, code: "AUTHORITY", severity: "BLOCK", moduleId: m.id, reason: `${m.name} (${m.layer}) mang role '${m.role}' — L1/L2/L3 chỉ ĐO, không được là trigger/veto/confirm/exit.` });
    if (m.layer === "L4" && m.role && m.role !== "CONTEXT_GATE") v.push({ layer: 5, code: "AUTHORITY", severity: "BLOCK", moduleId: m.id, reason: `${m.name} (L4) chỉ được là CONTEXT_GATE.` });
    if (m.layer === "L5" && m.role === "TRIGGER" && !m.direction) v.push({ layer: 5, code: "TRIGGER_NO_DIR", severity: "BLOCK", moduleId: m.id, reason: `${m.name} là TRIGGER nhưng thiếu hướng (LONG/SHORT/REGIME).` });
    if (m.layer === "L6" && m.role && m.role !== "ZONE") v.push({ layer: 5, code: "AUTHORITY", severity: "BLOCK", moduleId: m.id, reason: `${m.name} (L6) chỉ được là ZONE (vẽ vùng, không vào lệnh).` });
  }

  // ── ContributionMap — nhìn thấy tầng nào ảnh-hưởng trước cả khi chạy Microscope ──
  const inert = new Set(v.filter((x) => x.code === "INERT_EVIDENCE").map((x) => x.moduleId));
  const contributionMap: ContribRow[] = mods.map((m) => {
    if (m.layer === "L5" && m.role === "TRIGGER") return { id: m.id, layer: m.layer, name: m.name, contribution: "DRIVES" as Contribution, reason: "TRIGGER — tạo điểm vào của card." };
    if (m.layer === "L4" || (m.layer === "L5" && (m.role === "VETO" || m.role === "CONFIRM" || m.role === "EXIT"))) return { id: m.id, layer: m.layer, name: m.name, contribution: "FILTERS" as Contribution, reason: "Gate/veto/confirm/exit — lọc/điều-chỉnh lệnh của TRIGGER (cần có TRIGGER mới có tác-dụng)." };
    if (isEvidence(m.layer)) return inert.has(m.id) ? { id: m.id, layer: m.layer, name: m.name, contribution: "INERT" as Contribution, reason: "Không tầng nào đọc — ngồi không." } : { id: m.id, layer: m.layer, name: m.name, contribution: "FILTERS" as Contribution, reason: "Bằng-chứng được tầng trên đọc." };
    return { id: m.id, layer: m.layer, name: m.name, contribution: "FILTERS" as Contribution, reason: "Zone/khác." };
  });

  return { ok: !v.some((x) => x.severity === "BLOCK"), violations: v, contributionMap, hasTrigger };
}
