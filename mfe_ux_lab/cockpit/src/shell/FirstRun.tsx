import {useRef, useState} from 'react';
import {parseCsvOhlc} from '../lib/csvOhlc.ts';
import {stageCsvImport} from '../lib/pendingCsvImport.ts';
import {MT5_OPEN_DIALOG_EVENT} from '../lib/mt5Connection.ts';
import './first-run.css';

export function FirstRun({navigate}: {navigate: (page: string) => void}) {
  const [open, setOpen] = useState(() => localStorage.getItem('quantsmart-first-run-v1') !== 'done');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const finish = () => { localStorage.setItem('quantsmart-first-run-v1', 'done'); setOpen(false); };
  if (!open) return null;
  return <section className="first-run" aria-labelledby="first-run-title">
    <h1 id="first-run-title">Choose your first data source</h1>
    <p>QUANTSMART is ready. No market history is bundled. Import an OHLC CSV to inspect its chart, or connect your own MT5 terminal on Windows. Your data stays on this machine.</p>
    <div className="first-run-actions">
      <button disabled={busy} onClick={() => picker.current?.click()}>{busy ? 'Reading CSV…' : 'Import OHLC CSV'}</button>
      <button onClick={() => { finish(); window.dispatchEvent(new CustomEvent(MT5_OPEN_DIALOG_EVENT)); }}>Connect MT5</button>
      <button onClick={() => { finish(); navigate('help'); }}>Read the guide</button>
      <button onClick={finish}>Explore without data</button>
    </div>
    <input ref={picker} type="file" accept=".csv,.tsv,.txt" aria-label="First historical OHLC CSV" hidden onChange={async event => {
      const file = event.target.files?.[0]; if (!file) return;
      setError('');
      if (file.size > 24 * 1024 * 1024) { setError('Choose a CSV smaller than 24 MB. Split larger histories into smaller files first.'); event.target.value = ''; return; }
      setBusy(true);
      try {
        const parsed = parseCsvOhlc(await file.text());
        if ('error' in parsed) { setError(parsed.error); return; }
        stageCsvImport({...parsed, filename: file.name}); finish(); navigate('microscope');
      } catch { setError('The CSV could not be read. Check file permissions and try again.'); }
      finally { setBusy(false); if (picker.current) picker.current.value = ''; }
    }}/>
    {error && <p role="alert">{error}</p>}
    <small>Use columns time, open, high, low and close. CSV times without an offset are interpreted as UTC. Imports are held in this browser session; retain your original file. The parser reports any filtering or truncation warnings in Microscope.</small>
  </section>;
}
