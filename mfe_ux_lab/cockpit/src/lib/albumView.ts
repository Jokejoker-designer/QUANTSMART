// albumView — WO-2. Strategy Album = a READ-ONLY index/filter/sort over the saved cards
// (mfe_strategy_cards) + their derived Passports. NO engine, NO execution: it never runs a backtest —
// it indexes whatever passports the caller already has (PASSPORT_MODELED when a card was run, else
// NEEDS_RUN). Filters map 1:1 to taxonomy dimensions; structural dims (pattern family / TF / risk style)
// are derivable from the card alone, so a NEEDS_RUN card is still classifiable by its "hệ". Modeled · advisory.
import type { CardPassport } from "./cardPassport.ts";
import { patternFamilyOf } from "./cardTaxonomy.ts";

export interface AlbumCard { id: string; name: string; archetype?: string; modules?: string[]; [key: string]: unknown }
export interface AlbumStructural { patternFamily: string; timeframe: string; riskStyle: string }
export interface AlbumEntry { card: AlbumCard; passport: CardPassport; structural: AlbumStructural }

// structural classification from the card alone (no backtest) — honest: modules/card only.
export function structuralTags(card: AlbumCard, timeframe: string): AlbumStructural {
  const mods = Array.isArray(card.modules) ? card.modules : [];
  const riskStyle = mods.includes("distribution_rr") ? "Distribution R:R" : mods.includes("auto_rr") ? "Auto R:R" : "Fixed R";
  return { patternFamily: patternFamilyOf(mods), timeframe, riskStyle };
}

function needsRunPassport(card: AlbumCard): CardPassport {
  return { card_id: card.id, card_name: card.name, generated_at: "", status: "NEEDS_RUN", modeled: true,
    needsRunReason: "Chưa chạy realistic backtest — chọn card để chạy (không bịa tag)." };
}

// Build entries by pairing each card with its passport (PASSPORT_MODELED if cached, else NEEDS_RUN).
export function buildAlbum(cards: AlbumCard[], passports: Record<string, CardPassport>, timeframeOf: (c: AlbumCard) => string): AlbumEntry[] {
  return cards.map((card) => {
    const cached = passports[card.id];
    const passport = cached && cached.status === "PASSPORT_MODELED" ? cached : needsRunPassport(card);
    return { card, passport, structural: structuralTags(card, timeframeOf(card)) };
  });
}

export type AlbumStatusFilter = "ALL" | "RUN_ONLY" | "NEEDS_RUN";
export interface AlbumFilter {
  status?: AlbumStatusFilter;
  patternFamily?: string;   // structural (works even for NEEDS_RUN)
  timeframe?: string;       // structural
  honestyVerdict?: string;  // run-derived (PASSPORT_MODELED only)
}

export function filterAlbum(entries: AlbumEntry[], f: AlbumFilter): AlbumEntry[] {
  return entries.filter((e) => {
    const run = e.passport.status === "PASSPORT_MODELED";
    if (f.status === "RUN_ONLY" && !run) return false;
    if (f.status === "NEEDS_RUN" && run) return false;
    if (f.patternFamily && e.structural.patternFamily !== f.patternFamily) return false;
    if (f.timeframe && e.structural.timeframe !== f.timeframe) return false;
    if (f.honestyVerdict) { if (!run || e.passport.honesty!.value !== f.honestyVerdict) return false; }
    return true;
  });
}

const TRUST_RANK: Record<string, number> = { ROBUST_IN_SIM: 3, CONDITIONAL_EDGE: 2, FRAGILE_EDGE: 1, NO_EDGE_AFTER_COST: 0 };
function rankOf(e: AlbumEntry): number { return e.passport.status === "PASSPORT_MODELED" ? (TRUST_RANK[e.passport.honesty!.value] ?? -1) : -1; }
function netROf(e: AlbumEntry): number { return e.passport.status === "PASSPORT_MODELED" ? e.passport.metrics!.netNetR.value : -Infinity; }

export type AlbumSort = "honesty" | "netR" | "name";
export function sortAlbum(entries: AlbumEntry[], by: AlbumSort): AlbumEntry[] {
  const arr = entries.slice();
  if (by === "name") arr.sort((a, b) => a.card.name.localeCompare(b.card.name));
  else if (by === "netR") arr.sort((a, b) => netROf(b) - netROf(a));
  else arr.sort((a, b) => rankOf(b) - rankOf(a));
  return arr;
}

// distinct structural facet values present in the album (for filter dropdowns).
export function albumFacets(entries: AlbumEntry[]): { patternFamilies: string[]; timeframes: string[] } {
  return {
    patternFamilies: Array.from(new Set(entries.map((e) => e.structural.patternFamily))).sort(),
    timeframes: Array.from(new Set(entries.map((e) => e.structural.timeframe))).sort(),
  };
}
