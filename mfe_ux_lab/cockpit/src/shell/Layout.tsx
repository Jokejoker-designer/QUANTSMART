// Shared research workspace shell. Presentation only; navigation grants no authority.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getActiveSymbol, setActiveSymbol, SYMBOL_CHANGED_EVENT, SYMBOL_REGISTRY } from "../lib/activeSymbolStore.ts";
import { Glyph } from "../components/ui/Glyph.tsx";
import { WORKSPACE_GROUPS, WORKSPACES, workspaceFor, searchWorkspaces } from "./navigation.ts";
import { ConnectionStatus } from "./ConnectionStatus.tsx";
import { WorkspaceSaveStatus } from "./WorkspaceGate.tsx";
import "./workspace.css";
import "./guide.css";

function CommandPalette({ onNavigate, onClose }: { onNavigate: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState(""); const [selected, setSelected] = useState(0);
  const dialog = useRef<HTMLDivElement>(null); const results = searchWorkspaces(query);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; dialog.current?.querySelector("input")?.focus();
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => { dialog.current?.querySelector(`[data-result-index="${selected}"]`)?.scrollIntoView({ block: "nearest" }); }, [selected]);
  const choose = (id: string) => { onNavigate(id); onClose(); };
  return createPortal(<div className="command-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="command-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label={"Switch workspace"} onKeyDown={(e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setSelected((index) => results.length ? (index + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0); }
      if (e.key === "Enter" && e.target instanceof HTMLInputElement && results[selected]) { e.preventDefault(); choose(results[selected].id); }
      if (e.key === "Tab") {
        const controls = dialog.current?.querySelectorAll<HTMLElement>("input, button");
        if (controls?.length) { const first = controls[0], last = controls[controls.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
      }
    }}>
      <div className="command-input"><Glyph name="search" size={19} /><input aria-label={"Find workspace"} role="combobox" aria-expanded="true" aria-controls="workspace-results" aria-activedescendant={results[selected] ? `jump-${results[selected].id}` : undefined} placeholder={"Search workspaces, tasks or terms…"} value={query} onChange={(e) => { setQuery(e.target.value); setSelected(0); }} /><button onClick={onClose} aria-label={"Close search"}><kbd>Esc</kbd></button></div>
      <div className="command-results" id="workspace-results" role="listbox" aria-label="Workspace">{results.map((item, index) => <div key={item.id} id={`jump-${item.id}`} role="option" aria-selected={selected === index} data-result-index={index} className={`command-result ${selected === index ? "selected" : ""}`} onMouseEnter={() => setSelected(index)} onClick={() => choose(item.id)}><Glyph name={item.icon} size={18} /><span><strong>{item.label}</strong><small>{item.description}</small></span><span className="result-group">{WORKSPACE_GROUPS.find((group) => group.id === item.group)?.label}</span></div>)}{!results.length && <p className="command-empty">No workspace found. Try “Coefficients”, “Canvas” or “Guide”.</p>}</div>
      <div className="command-footer"><span>↑ ↓ select</span><span>Enter to open</span><span>Workspace navigation only</span></div>
    </div>
  </div>, document.body);
}

export function Layout({ current, onNavigate, children }: { current: string; onNavigate: (id: string) => void; children: ReactNode }) {
  const [sym, setSym] = useState(getActiveSymbol); const [menu, setMenu] = useState<string | null>(null); const [palette, setPalette] = useState(false);
  const [assetSynced, setAssetSynced] = useState(false);
  const header = useRef<HTMLElement>(null); const active = workspaceFor(current);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  useEffect(() => {
    const sync = () => { setSym(getActiveSymbol()); setAssetSynced(false); };
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); setMenu(null); } if (e.key === "Escape") setMenu(null); };
    const outside = (e: PointerEvent) => { if (!header.current?.contains(e.target as Node)) setMenu(null); };
    window.addEventListener(SYMBOL_CHANGED_EVENT, sync); window.addEventListener("keydown", key); document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener(SYMBOL_CHANGED_EVENT, sync); window.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, []);
  const go = (id: string) => { onNavigate(id); setMenu(null); };
  return <div className="app-shell workspace-shell">
    <header className="workspace-header" ref={header}>
      <div className="workspace-context"><button className="workspace-brand" onClick={() => go("home")} aria-label={"QUANTSMART · open Cockpit"}><span aria-hidden="true">◈</span> QUANTSMART</button><span className="context-divider">/</span><span className={`asset-feed-dot ${assetSynced ? "synced" : ""}`} title={assetSynced ? "Current live feed" : "Live feed not verified"} /><select aria-label={"Asset"} value={sym} onChange={(e) => { setActiveSymbol(e.target.value); if (!SYMBOL_REGISTRY.find((s) => s.symbol === e.target.value)?.hasLocalData) go("assets"); }}>{SYMBOL_REGISTRY.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}</select></div>
      <nav className="workspace-navigation" aria-label={"Main navigation"}>{WORKSPACE_GROUPS.map((group) => <div className="workspace-nav-group" key={group.id}><button className={`workspace-nav-link ${active?.group === group.id ? "is-active" : ""}`} aria-current={active?.group === group.id ? "page" : undefined} aria-expanded={group.id === "cockpit" || group.id === "microscope" ? undefined : menu === group.id} onClick={() => group.id === "cockpit" ? go("home") : group.id === "microscope" ? go("microscope") : setMenu(menu === group.id ? null : group.id)}>{group.label}{group.id !== "cockpit" && group.id !== "microscope" && <span className="nav-chevron">▾</span>}</button>{menu === group.id && <div className="workspace-dropdown">{WORKSPACES.filter((item) => item.group === group.id).map((item) => <button key={item.id} className={current === item.id ? "selected" : ""} onClick={() => go(item.id)}><Glyph name={item.icon} size={16} /><span>{item.label}</span></button>)}</div>}</div>)}</nav>
      <div className="workspace-mobile-nav"><button className="mobile-workspace-trigger" aria-expanded={menu === "mobile"} onClick={() => setMenu(menu === "mobile" ? null : "mobile")}><Glyph name="menu" size={16} /><span>{active?.label || "Workspace"}</span><span>▾</span></button>{menu === "mobile" && <div className="workspace-dropdown mobile-workspace-menu">{WORKSPACE_GROUPS.map((group) => <div key={group.id}><div className="dropdown-group-label">{group.label}</div>{WORKSPACES.filter((item) => item.group === group.id).map((item) => <button key={item.id} className={current === item.id ? "selected" : ""} onClick={() => go(item.id)}><Glyph name={item.icon} size={15} />{item.label}</button>)}</div>)}</div>}</div>
      <div className="workspace-tools"><button className="command-trigger" onClick={() => setPalette(true)} aria-label={"Find workspace (Ctrl+K)"}><Glyph name="search" size={15} /><span>Jump to…</span><kbd>{mac ? "⌘ K" : "Ctrl K"}</kbd></button><ConnectionStatus onSynced={setAssetSynced} /></div>
    </header>
    {active && (active.group === "cockpit" || active.group === "microscope") && <nav className={`workspace-subnav ${current === "home" ? "workspace-subnav-cockpit" : ""}`} aria-label={"Workspace views"}>{WORKSPACES.filter((item) => item.group === active.group).map((item) => <button key={item.id} aria-current={item.id === current ? "page" : undefined} className={item.id === current ? "is-active" : ""} onClick={() => go(item.id)}>{item.label}</button>)}{current === "home" ? <div id="cockpit-controls-slot" /> : <button className="workspace-help-link" onClick={() => go("help")}><Glyph name="book" size={14} />Guide</button>}</nav>}
    <main className="main main-wide" data-workspace={current} key={sym}>{active && current !== "help" && current !== "home" && <div className="workspace-orientation"><span>{WORKSPACE_GROUPS.find((g) => g.id === active.group)?.label} / {active.label}</span><details><summary>About this workspace</summary><p>{active.description} Use Ctrl+K to switch workspaces, or open Guide for task-based instructions.</p></details><button onClick={() => go("help")}><Glyph name="book" size={13} />Guide</button></div>}{children}</main>
    <footer className="workspace-statusbar"><WorkspaceSaveStatus /><span>QUANTSMART <span>·</span> RESEARCH WORKSPACE</span><span>{sym} <span>·</span> SHADOW / NO DECISION</span><button onClick={() => go("help")}>User guide</button></footer>
    {palette && <CommandPalette onNavigate={go} onClose={() => setPalette(false)} />}
  </div>;
}
export function PageHeader({ title, sub }: { title: string; sub?: string }) { return <header><h1 className="page-title">{title}</h1>{sub && <p className="page-sub">{sub}</p>}</header>; }
