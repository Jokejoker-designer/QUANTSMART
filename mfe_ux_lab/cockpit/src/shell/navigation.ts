// Presentation registry. Navigation never executes a research or broker action.
import type { GlyphName } from "../components/ui/Glyph.tsx";
export const WORKSPACE_GROUPS = [
  { id: "cockpit", label: "Cockpit" }, { id: "microscope", label: "Microscope" },
  { id: "studio", label: "Strategy Studio" }, { id: "analytics", label: "Analytics" }, { id: "system", label: "System" },
] as const;
export type WorkspaceGroup = typeof WORKSPACE_GROUPS[number]["id"];
export interface Workspace { id: string; label: string; group: WorkspaceGroup; icon: GlyphName; description: string; aliases: string }
export const WORKSPACES: Workspace[] = [
  { id: "home", label: "Overview", group: "cockpit", icon: "monitor", description: "Observe actual OHLC data and inspect a Card's measured evidence.", aliases: "home overview" },
  { id: "entry-danger", label: "Entry & Danger", group: "cockpit", icon: "shield", description: "Read current source assessments and measurement availability.", aliases: "entry danger assessment" },
  { id: "microscope", label: "Chart & Replay", group: "microscope", icon: "microscope", description: "Inspect charts and replay strategy evaluations bar by bar.", aliases: "microscope chart history replay" },
  { id: "kidi-events", label: "KIDI Events", group: "microscope", icon: "tape", description: "Review flat-feed and zero-range observations in the selected tape.", aliases: "events data quality" },
  { id: "playbook", label: "Playbook", group: "studio", icon: "book", description: "Compare current observations with dated historical research.", aliases: "instability episodes" },
  { id: "strategy-lab", label: "Strategy Lab", group: "studio", icon: "flask", description: "Review saved validation runs, OOS windows and module contributions.", aliases: "validation results" },
  { id: "strategy-canvas", label: "Canvas", group: "studio", icon: "window", description: "Assemble, save and validate a research Strategy Card.", aliases: "strategy canvas build create" },
  { id: "blocks-modules", label: "Blocks & Modules", group: "studio", icon: "puzzle", description: "Inspect blocks, modules, roles and their mechanisms.", aliases: "blocks modules library" },
  { id: "beast-lab", label: "Beast", group: "studio", icon: "beast", description: "Compose Cards by role and verify their source lineage.", aliases: "card beast ensemble" },
  { id: "formula-lab", label: "Coordinate Lab", group: "studio", icon: "ruler", description: "Explore formula curves, density and modeled geometry.", aliases: "quantlab coordinate formula" },
  { id: "weekly-audit", label: "Weekly Audit", group: "analytics", icon: "calendar", description: "Review recent validation activity and available broker statistics.", aliases: "weekly audit" },
  { id: "strategy-ranking", label: "Compatibility Map", group: "analytics", icon: "map", description: "Compare actual Card coverage across saved research windows.", aliases: "compatibility map" },
  { id: "assets", label: "Assets", group: "analytics", icon: "globe", description: "Inspect dataset availability and configure dated sources.", aliases: "assets symbol data" },
  { id: "hidden-coefficients", label: "Hidden Coefficients", group: "system", icon: "digits", description: "Audit configuration coefficients and edit a Shadow profile.", aliases: "coefficients calibration weights" },
  { id: "analysis", label: "Governance", group: "system", icon: "shield", description: "Inspect the current workspace, engine and historical archive.", aliases: "analysis governance" },
  { id: "debugger", label: "Debugger", group: "system", icon: "wrench", description: "Inspect actual service payloads and source errors.", aliases: "debugger errors diagnostics" },
  { id: "help", label: "Guide", group: "system", icon: "book", description: "Get started, follow a task or look up a term.", aliases: "guide help getting started" },
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
