// MFE Co-Trade Cockpit — <Glyph>: the house icon system that replaces emoji across the UI.
// A single monoline SVG set (24×24 grid, stroke=currentColor) so every icon shares one line weight and
// inherits the color of its context/theme — no per-site color mapping. Presentation only; no logic, no data.
// The path strings are the exact geometry approved in the glyph mockup (owner review), kept verbatim as a
// registry and injected into one <svg> so what ships matches what was signed off, 1:1.
// ADVISORY_ONLY · ORDER_SEND_FORBIDDEN · ZONE_ONLY — an icon never encodes a decision.
import type { CSSProperties } from "react";

export type GlyphName =
  | "check" | "check-circle" | "x" | "x-circle" | "warning" | "forbidden" | "dot"
  | "star" | "star-circle" | "trophy" | "skull" | "stop" | "traffic" | "idle"
  | "lock" | "unlock" | "shield" | "id" | "bookmark" | "tag" | "balance" | "chain" | "swords" | "key"
  | "puzzle" | "dna" | "flask" | "microscope" | "calc" | "brain" | "compass" | "magnet" | "wall"
  | "gear" | "wrench" | "plug" | "link" | "plus" | "digits" | "ruler" | "ladder" | "hex"
  | "bar-chart" | "trend-up" | "trend-down" | "money" | "cash" | "target" | "candle" | "wave" | "bolt"
  | "fire" | "seedling" | "tree" | "swan" | "beast" | "card" | "hook" | "parachute"
  | "package" | "import" | "export" | "save" | "folder" | "trash" | "tape" | "refresh" | "index"
  | "clipboard" | "calendar" | "map" | "books" | "book" | "pin" | "edit"
  | "globe" | "robot" | "eye" | "search" | "chat" | "handshake" | "score" | "sliders" | "monitor"
  | "antenna" | "satellite" | "gamepad" | "menu" | "arrow-up" | "arrow-down" | "ghost" | "window" | "expand";

// inner markup of a 24×24 viewBox svg — stroke inherits from the <svg> (currentColor); a few marks fill.
const ICONS: Record<GlyphName, string> = {
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.6 2.6L16.2 9"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  "x-circle": '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  warning: '<path d="M12 3.2L2.2 20.2h19.6L12 3.2z"/><path d="M12 9.5v4.6"/><path d="M12 17.4v.05"/>',
  forbidden: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  dot: '<circle cx="12" cy="12" r="5.4" fill="currentColor" stroke="none"/>',
  star: '<path d="M12 3.6l2.6 5.3 5.8.9-4.2 4.1 1 5.8L12 17l-5.2 2.7 1-5.8-4.2-4.1 5.8-.9L12 3.6z"/>',
  "star-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 7l1.5 3 3.3.5-2.4 2.3.6 3.3L12 14.9 9 16.4l.6-3.3L7.2 10.5 10.5 10z"/>',
  trophy: '<path d="M7 4.5h10v3.5a5 5 0 01-10 0V4.5z"/><path d="M7 6.5H4.2v1a3 3 0 002.9 3M17 6.5h2.8v1a3 3 0 01-2.9 3"/><path d="M12 13v3.5M9 20.5h6M9.8 16.5h4.4v4H9.8z"/>',
  skull: '<path d="M5 11.5a7 7 0 0114 0v2.5l-1.4 1.4v2.1H6.4v-2.1L5 14V11.5z"/><circle cx="9" cy="12.2" r="1.7" fill="currentColor" stroke="none"/><circle cx="15" cy="12.2" r="1.7" fill="currentColor" stroke="none"/><path d="M10.6 20.5v-2M13.4 20.5v-2"/>',
  stop: '<path d="M8 3.6h8L20.4 8v8L16 20.4H8L3.6 16V8L8 3.6z"/>',
  traffic: '<rect x="8" y="3" width="8" height="18" rx="3.4"/><circle cx="12" cy="7.4" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="16.6" r="1.5"/>',
  idle: '<path d="M6.5 8h5l-5 6h5"/><path d="M13 4.5h4.5l-4.5 5h4.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/><path d="M12 14v2.6"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V8a4 4 0 017.6-1.9"/><path d="M12 14v2.6"/>',
  shield: '<path d="M12 3l7 3v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6l7-3z"/>',
  id: '<rect x="3" y="6" width="18" height="12" rx="2.2"/><circle cx="8.6" cy="12" r="2.3"/><path d="M13 10.2h5M13 13.8h5"/>',
  bookmark: '<path d="M7 4h10v16l-5-4.2-5 4.2V4z"/>',
  tag: '<path d="M4 4h7l9 9-7 7-9-9V4z"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>',
  balance: '<path d="M12 3.4v17M6 20.4h12M4 7.6h16"/><path d="M4 7.6l-2.3 5.2a3 3 0 004.6 0L4 7.6z"/><path d="M20 7.6l-2.3 5.2a3 3 0 004.6 0L20 7.6z"/>',
  chain: '<rect x="3.5" y="9" width="9" height="6" rx="3"/><rect x="11.5" y="9" width="9" height="6" rx="3"/>',
  swords: '<path d="M14.6 3.5L6 12l-2 4.2 4.2-2L16.8 5.6"/><path d="M9.4 3.5L18 12l2 4.2-4.2-2"/><path d="M15.5 15.5l3 3M8.5 15.5l-3 3"/>',
  key: '<circle cx="8" cy="8.4" r="4"/><path d="M10.9 11.3l7.6 7.6M15.4 15.8l2-2M17.6 18l2-2"/>',
  puzzle: '<path d="M10 4.6a1.6 1.6 0 013.9 0c0 .5-.2.8-.4 1.1-.2.3-.1.9.5.9h3v3c0 .6.6.7.9.5.3-.2.6-.4 1.1-.4a1.6 1.6 0 010 3.9c-.5 0-.8-.2-1.1-.4-.3-.2-.9-.1-.9.5v3h-3c-.6 0-.7-.6-.5-.9.2-.3.4-.6.4-1.1a1.6 1.6 0 00-3.9 0c0 .5.2.8.4 1.1.2.3.1.9-.5.9H6v-3c0-.6-.6-.7-.9-.5-.3.2-.6.4-1.1.4a1.6 1.6 0 010-3.9c.5 0 .8.2 1.1.4.3.2.9.1.9-.5V6.5h3c.6 0 .7-.6.5-.9-.2-.3-.4-.6-.4-1z"/>',
  dna: '<path d="M7 3c0 5 10 6 10 9s-10 4-10 9"/><path d="M17 3c0 5-10 6-10 9s10 4 10 9"/><path d="M8.6 6h6.8M8.6 18h6.8M6.9 12h10.2"/>',
  flask: '<path d="M9 3.2h6M10 3.2v6l-4.6 8.1A1.5 1.5 0 006.7 19.6h10.6a1.5 1.5 0 001.3-2.3L14 9V3.2"/><path d="M7.7 15h8.6"/>',
  microscope: '<path d="M6 20.4h11"/><path d="M9.3 20.4L7.6 15.6"/><path d="M9.4 6.6l3.6 3.6-2.6 2.6-3.6-3.6a1.85 1.85 0 012.6-2.6z"/><path d="M12.2 4.8l1.9 1.9"/><path d="M12.8 16a4.8 4.8 0 003.4-4.6"/>',
  calc: '<rect x="5" y="3.4" width="14" height="17.2" rx="2.2"/><path d="M8 7.4h8"/><path d="M8.6 11h.05M12 11h.05M15.4 11h.05M8.6 14h.05M12 14h.05M15.4 14h.05M8.6 17h.05M12 17h.05M15.4 17h.05"/>',
  brain: '<path d="M9.2 6a2.8 2.8 0 00-2.8 2.8A2.9 2.9 0 005.5 14 2.9 2.9 0 009.2 19.6V6z"/><path d="M14.8 6a2.8 2.8 0 012.8 2.8A2.9 2.9 0 0118.5 14a2.9 2.9 0 01-3.7 5.6V6z"/><path d="M9.2 6a2.9 2.9 0 015.6 0"/><path d="M12 5.6v14.4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1z"/>',
  magnet: '<path d="M6 4h4v8a2 2 0 004 0V4h4v8a6 6 0 01-12 0V4z"/><path d="M6 8.4h4M14 8.4h4"/>',
  wall: '<rect x="3.5" y="6" width="17" height="12" rx="1.4"/><path d="M3.5 12h17M9 6v3M15 6v3M6 12v3M12 12v3M18 12v3M9 15v3M15 15v3"/>',
  gear: '<path d="M12 2.6v3.1M12 18.3v3.1M2.6 12h3.1M18.3 12h3.1M5.1 5.1l2.2 2.2M16.7 16.7l2.2 2.2M18.9 5.1l-2.2 2.2M7.3 16.7l-2.2 2.2"/><circle cx="12" cy="12" r="3.4"/>',
  wrench: '<path d="M15.5 3.6a4.2 4.2 0 00-4.7 5.5L3.8 16.1 6.1 18.4l7-7a4.2 4.2 0 005.5-4.7l-2.6 2.6-2.4-2.4 2.5-2.9z"/>',
  plug: '<path d="M9 3v5M15 3v5"/><path d="M7 8h10v2a5 5 0 01-10 0V8z"/><path d="M12 15v6"/>',
  link: '<path d="M9.6 14.4l4.8-4.8"/><path d="M8.2 12l-1.9 1.9a3.4 3.4 0 004.8 4.8L13 16.8"/><path d="M15.8 12l1.9-1.9a3.4 3.4 0 00-4.8-4.8L11 7.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  digits: '<path d="M8.4 4L6 20M18 4l-2.4 16M4 9h16M3.4 15h16"/>',
  ruler: '<rect x="2.6" y="8.4" width="18.8" height="7.2" rx="1.3"/><path d="M6.6 8.4v3.2M10 8.4v4.2M13.4 8.4v3.2M16.8 8.4v4.2"/>',
  ladder: '<path d="M8 3v18M16 3v18"/><path d="M8 7h8M8 11h8M8 15h8M8 19h8"/>',
  hex: '<path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9L12 3z"/>',
  "bar-chart": '<path d="M4 20h16"/><rect x="5.6" y="11" width="3.2" height="6"/><rect x="10.4" y="7" width="3.2" height="10"/><rect x="15.2" y="13" width="3.2" height="4"/>',
  "trend-up": '<path d="M4 16.5l5-5 3 3 7-7"/><path d="M15 7.5h5v5"/>',
  "trend-down": '<path d="M4 7.5l5 5 3-3 7 7"/><path d="M15 16.5h5v-5"/>',
  money: '<path d="M8.8 6.4h6.4l1.9 3.3c1.5 2.6 1.5 6 0 8.6-1.9 3-8.2 3-10.1 0-1.5-2.6-1.5-6 0-8.6l1.9-3.3z"/><path d="M10.3 6.4L12 3.2l1.7 3.2"/><path d="M12 10.6v6.2M10.4 12.3h2a1.3 1.3 0 010 2.6h-2.4"/>',
  cash: '<rect x="3" y="6.6" width="18" height="10.8" rx="1.6"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.4v5.2M18 9.4v5.2"/>',
  target: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.1"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>',
  candle: '<path d="M12 3v3.6M12 17.4V21"/><rect x="8.4" y="6.6" width="7.2" height="10.8" rx="1.2"/>',
  wave: '<path d="M2 14.2c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M2 9c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>',
  bolt: '<path d="M13 2.4L4.2 14h5.8l-1 7.6L19.8 10h-5.8l1-7.6z"/>',
  fire: '<path d="M12.5 3c.6 3 3.5 4.6 3.5 8a4 4 0 01-8 .3c-.1-1.7.7-2.9 1.4-3.6.1 1.1.7 1.9 1.5 2.2C11 7.6 11.6 5.1 12.5 3z"/>',
  seedling: '<path d="M12 20.5v-7.5"/><path d="M12 13c0-3-2.2-5-6-5 0 3 2.2 5 6 5z"/><path d="M12 12c0-2.6 2-4.6 5.6-4.6 0 2.6-2 4.6-5.6 4.6z"/>',
  tree: '<path d="M12 3l5.2 7.2h-3l4.2 5.3H6.6l4.2-5.3h-3L12 3z"/><path d="M12 15.5V21"/>',
  swan: '<path d="M5.5 19c0-4.2 2.3-7.2 6.3-7.2 2 0 3.2-1.1 3.2-3a2.6 2.6 0 00-4.7-1.6"/><path d="M5.5 19h11.2"/><path d="M15 8.6l2.2-1"/>',
  beast: '<path d="M4 8.6C6 5.6 11 4.3 15 7"/><path fill="currentColor" stroke="none" d="M6 7.6C7.4 10.6 7.8 14.6 7.2 18.9 6.2 15.1 5 11.1 4.3 8.1Z"/><path fill="currentColor" stroke="none" d="M10 6.9C11.4 10.3 11.9 14.7 11.3 19.1 10.3 15.1 9 11.1 8.2 7.5Z"/><path fill="currentColor" stroke="none" d="M14 6.9C15.4 10.1 15.9 14.1 15.3 18.7 14.3 14.7 13 11.1 12.2 7.5Z"/>',
  card: '<rect x="6" y="3.4" width="12" height="17.2" rx="2.2"/><path d="M12 8l2.6 3.6L12 15.2 9.4 11.6 12 8z"/>',
  hook: '<path d="M15.2 4.2v8a4.2 4.2 0 01-8.4 0v-.6"/><path d="M6.8 11.6l-1.6 1.6M6.8 11.6l1.6 1.6"/><circle cx="15.2" cy="3.4" r="1.1"/>',
  parachute: '<path d="M3.2 11.4a8.8 8.8 0 0117.6 0"/><path d="M3.2 11.4l4.6 3M20.8 11.4l-4.6 3M12 2.6v11.8"/><path d="M7.4 14.4l4.6 4.4 4.6-4.4"/>',
  package: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4.2 7.6L12 12l7.8-4.4"/><path d="M12 12v9"/>',
  import: '<path d="M4 14v3.8A1.6 1.6 0 005.6 19.4h12.8A1.6 1.6 0 0020 17.8V14"/><path d="M12 3.6v9.4M8.4 9.6L12 13l3.6-3.4"/>',
  export: '<path d="M4 14v3.8A1.6 1.6 0 005.6 19.4h12.8A1.6 1.6 0 0020 17.8V14"/><path d="M12 14.4V5M8.4 8.4L12 5l3.6 3.4"/>',
  save: '<path d="M5 4.6h10.5l3.5 3.5v11.3a1 1 0 01-1 1H5a1 1 0 01-1-1V5.6a1 1 0 011-1z"/><path d="M8 4.6v5h6v-5"/><rect x="8" y="13" width="8" height="6.8"/>',
  folder: '<path d="M4 7a1.6 1.6 0 011.6-1.6h3.8L11 7.4h7.4A1.6 1.6 0 0120 9v8.4a1.6 1.6 0 01-1.6 1.6H5.6A1.6 1.6 0 014 17.4V7z"/>',
  trash: '<path d="M5 7h14"/><path d="M8 7V5.2A1.6 1.6 0 019.6 3.6h4.8A1.6 1.6 0 0116 5.2V7"/><path d="M6.6 7l1 12.4A1.6 1.6 0 009.2 20.9h5.6a1.6 1.6 0 001.6-1.5L17.4 7"/><path d="M10 11v6M14 11v6"/>',
  tape: '<rect x="3" y="6" width="18" height="12" rx="2.2"/><circle cx="8.4" cy="12" r="2.4"/><circle cx="15.6" cy="12" r="2.4"/><path d="M6 16.4h12"/>',
  refresh: '<path d="M20 5.5v4.2h-4.2"/><path d="M4 18.5v-4.2h4.2"/><path d="M5.4 9.8A7 7 0 0117.9 8M18.6 14.2A7 7 0 016.1 16"/>',
  index: '<rect x="4" y="6" width="16" height="13" rx="2.2"/><path d="M4 10.2h16"/><path d="M8 6V4M16 6V4"/><path d="M7.6 14h5.4M7.6 16.4h3.4"/>',
  clipboard: '<rect x="6" y="5" width="12" height="16" rx="2.2"/><path d="M9 5V4a1.6 1.6 0 011.6-1.6h2.8A1.6 1.6 0 0115 4v1"/><path d="M9 11h6M9 15h6"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.2"/><path d="M4 10h16M8 3.4v4M16 3.4v4"/>',
  map: '<path d="M9 4.6L3.5 6.6v13L9 17.6l6 2 5.5-2v-13L15 6.6l-6-2z"/><path d="M9 4.6v13M15 6.6v13"/>',
  books: '<rect x="4.5" y="4.6" width="4" height="15" rx=".6"/><rect x="8.5" y="4.6" width="4" height="15" rx=".6"/><path d="M13 6.2l4 .7-2.1 13.1-4-.7z"/><path d="M6.5 8h0M10.5 8h0"/>',
  book: '<path d="M12 6.2C10 4.7 7 4.7 4 5.7v13c3-1 6-1 8 .6 2-1.6 5-1.6 8-.6v-13c-3-1-6-1-8 .5z"/><path d="M12 6.2v13"/>',
  pin: '<path d="M9.5 3.5h5l-.8 2 .8 6-2.5 2.5L9.5 11l.8-6-.8-2z"/><path d="M12 16v5"/>',
  edit: '<path d="M4 20l1-4L16.2 4.8a1.6 1.6 0 012.3 0l.7.7a1.6 1.6 0 010 2.3L8 19l-4 1z"/><path d="M14.5 6.5l3 3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  robot: '<rect x="4.6" y="8" width="14.8" height="11" rx="2.6"/><path d="M12 8V4.8"/><circle cx="12" cy="3.6" r="1.2"/><circle cx="9.4" cy="13" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.6" cy="13" r="1.3" fill="currentColor" stroke="none"/><path d="M9.6 16.4h4.8M2.8 12v3M21.2 12v3"/>',
  eye: '<path d="M2.4 12S6 6 12 6s9.6 6 9.6 6-3.6 6-9.6 6-9.6-6-9.6-6z"/><circle cx="12" cy="12" r="2.9"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.4"/><path d="M15.4 15.4L20 20"/>',
  chat: '<path d="M5 4.8h14A1.6 1.6 0 0120.6 6.4v8A1.6 1.6 0 0119 16H9l-4.4 3.6V6.4A1.6 1.6 0 015 4.8z"/><path d="M8.5 9.5h7M8.5 12.5h4"/>',
  handshake: '<path d="M7 12.2l2.8-2.8 2.2 2 2.2-2 2.8 2.8"/><path d="M3.2 10.2l3.8-1 3 3-1.8 1.8a1.5 1.5 0 01-2.1 0z"/><path d="M20.8 10.2l-3.8-1-3 3 1.8 1.8a1.5 1.5 0 002.1 0z"/>',
  score: '<path d="M9 18.2V6l9-2v10.4"/><ellipse cx="6.5" cy="18.2" rx="2.5" ry="2.2"/><ellipse cx="15.5" cy="16.2" rx="2.5" ry="2.2"/>',
  sliders: '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2.3"/><circle cx="9" cy="16" r="2.3"/>',
  monitor: '<rect x="3" y="4.6" width="18" height="12" rx="2.2"/><path d="M9 20.4h6M12 16.6v3.8"/>',
  antenna: '<circle cx="12" cy="12" r="2.2"/><path d="M8.2 8.2a5.5 5.5 0 000 7.6M15.8 8.2a5.5 5.5 0 010 7.6M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8"/>',
  satellite: '<path d="M6 12.2l-3 3 3 3 3-3z"/><path d="M9 9.2l3 3"/><path d="M13.8 4.2l6 6-3 3-6-6z"/><path d="M13.2 15.8a4.4 4.4 0 00-4-4"/>',
  gamepad: '<rect x="3" y="8" width="18" height="9" rx="4.5"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="15.4" cy="11.4" r="1" fill="currentColor" stroke="none"/><circle cx="17.6" cy="13.6" r="1" fill="currentColor" stroke="none"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  "arrow-up": '<path d="M12 20V5M6.5 10.5L12 5l5.5 5.5"/>',
  "arrow-down": '<path d="M12 4v15M6.5 13.5L12 19l5.5-5.5"/>',
  ghost: '<path d="M6 20.2v-8a6 6 0 0112 0v8l-2-1.6-2 1.6-2-1.6-2 1.6L6 20.2z"/><circle cx="10" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="11" r="1" fill="currentColor" stroke="none"/>',
  window: '<rect x="4" y="5" width="16" height="14" rx="2.2"/><path d="M4 9.2h16M8 5v4.2"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
};

export type GlyphProps = {
  name: GlyphName;
  size?: number | string;
  /** stroke color; defaults to currentColor (inherits the surrounding text/accent color) */
  color?: string;
  strokeWidth?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
};

export function Glyph({ name, size = 16, color, strokeWidth = 1.75, title, className, style }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ display: "inline-block", verticalAlign: "-0.14em", flexShrink: 0, ...(color ? { color } : null), ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

/** true if a glyph exists for `name` — lets call sites fall back safely for dynamic names. */
export function hasGlyph(name: string): name is GlyphName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

/** Raw inner SVG markup (paths) for a glyph — for SVG contexts (e.g. an existing chart <svg>) that
 *  inject it into a positioned <g> rather than mounting the <Glyph> element. Presentation only. */
export function glyphInner(name: GlyphName): string {
  return ICONS[name];
}
