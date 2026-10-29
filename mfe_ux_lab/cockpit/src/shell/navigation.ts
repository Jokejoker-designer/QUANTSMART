// Presentation registry. Navigation never executes a research or broker action.
import type { GlyphName } from "../components/ui/Glyph.tsx";
export const WORKSPACE_GROUPS = [
  { id: "cockpit", label: "Cockpit" }, { id: "microscope", label: "Microscope" },
  { id: "studio", label: "Strategy Studio" }, { id: "analytics", label: "Analytics" }, { id: "system", label: "System" },
] as const;
export type WorkspaceGroup = typeof WORKSPACE_GROUPS[number]["id"];
export interface Workspace { id: string; label: string; group: WorkspaceGroup; icon: GlyphName; description: string; aliases: string }
export const WORKSPACES: Workspace[] = [
  { id: "home", label: "Overview", group: "cockpit", icon: "monitor", description: "Observe actual OHLC data and inspect a Card's measured evidence.", aliases: "home trang chủ tổng quan" },
  { id: "entry-danger", label: "Entry & Danger", group: "cockpit", icon: "shield", description: "Read current source assessments and measurement availability.", aliases: "entry danger vào lệnh nguy hiểm" },
  { id: "microscope", label: "Chart & Replay", group: "microscope", icon: "microscope", description: "Inspect charts and replay strategy evaluations bar by bar.", aliases: "microscope biểu đồ lịch sử replay" },
  { id: "kidi-events", label: "KIDI Events", group: "microscope", icon: "tape", description: "Review flat-feed and zero-range observations in the selected tape.", aliases: "events sự kiện chất lượng dữ liệu" },
  { id: "playbook", label: "Playbook", group: "studio", icon: "book", description: "Compare current observations with dated historical research.", aliases: "instability bất ổn" },
  { id: "strategy-lab", label: "Strategy Lab", group: "studio", icon: "flask", description: "Review saved validation runs, OOS windows and module contributions.", aliases: "validation kiểm định kết quả" },
  { id: "strategy-canvas", label: "Canvas", group: "studio", icon: "window", description: "Assemble, save and validate a research Strategy Card.", aliases: "strategy canvas xây dựng tạo chiến lược" },
  { id: "blocks-modules", label: "Blocks & Modules", group: "studio", icon: "puzzle", description: "Inspect blocks, modules, roles and their mechanisms.", aliases: "blocks modules thư viện khối" },
  { id: "beast-lab", label: "Beast", group: "studio", icon: "beast", description: "Compose Cards by role and verify their source lineage.", aliases: "card beast ensemble" },
  { id: "formula-lab", label: "Coordinate Lab", group: "studio", icon: "ruler", description: "Explore formula curves, density and modeled geometry.", aliases: "quantlab formula tọa độ công thức" },
  { id: "weekly-audit", label: "Weekly Audit", group: "analytics", icon: "calendar", description: "Review recent validation activity and available broker statistics.", aliases: "weekly audit tuần kiểm toán" },
  { id: "strategy-ranking", label: "Compatibility Map", group: "analytics", icon: "map", description: "Compare actual Card coverage across saved research windows.", aliases: "compatibility map tương thích" },
  { id: "assets", label: "Assets", group: "analytics", icon: "globe", description: "Inspect dataset availability and configure dated sources.", aliases: "assets tài sản symbol dữ liệu" },
  { id: "hidden-coefficients", label: "Hidden Coefficients", group: "system", icon: "digits", description: "Audit configuration coefficients and edit a Shadow profile.", aliases: "coefficients hệ số calibration weights trọng số" },
  { id: "analysis", label: "Governance", group: "system", icon: "shield", description: "Inspect the current workspace, engine and historical archive.", aliases: "analysis governance quản trị" },
  { id: "debugger", label: "Debugger", group: "system", icon: "wrench", description: "Inspect actual service payloads and source errors.", aliases: "debugger lỗi chẩn đoán" },
  { id: "help", label: "Guide", group: "system", icon: "book", description: "Get started, follow a task or look up a term.", aliases: "guide help hướng dẫn trợ giúp bắt đầu" },
];
export const workspaceFor = (id: string) => WORKSPACES.find((item) => item.id === id);
export const validPage = (id: string) => !!workspaceFor(id);
export const pageFromHash = (hash: string) => { const id = hash.replace(/^#\/?/, "").split("?")[0]; return validPage(id) ? id : "home"; };
const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
export function searchWorkspaces(query: string): Workspace[] {
  const phrase = normalize(query), terms = phrase.split(/\s+/).filter(Boolean);
  const score = (item: Workspace) => normalize(item.label).includes(phrase) ? 100 : normalize(item.aliases).includes(phrase) ? 80 : 10;
  return WORKSPACES.filter((item) => terms.every((term) => normalize(`${item.label} ${item.aliases} ${item.description}`).includes(term))).sort((a, b) => phrase ? score(b) - score(a) : 0);
}
