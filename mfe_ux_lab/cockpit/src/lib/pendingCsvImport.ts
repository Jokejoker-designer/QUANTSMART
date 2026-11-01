import {parseCsvOhlc} from './csvOhlc.ts';
type ParsedCsv = Exclude<ReturnType<typeof parseCsvOhlc>, {error: string}>;
export type PendingCsvImport = ParsedCsv & {filename: string};
let pending: PendingCsvImport | null = null;
export function stageCsvImport(value: PendingCsvImport) { pending = value; }
export function takeCsvImport() { const value = pending; pending = null; return value; }
