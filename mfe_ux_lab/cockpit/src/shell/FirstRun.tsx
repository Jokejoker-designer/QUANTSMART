import {useState} from 'react';
import {CsvImportPanel} from '../components/CsvImportPanel.tsx';
import {MT5_OPEN_DIALOG_EVENT} from '../lib/mt5Connection.ts';
import './first-run.css';

export function FirstRun({navigate}: {navigate: (page: string) => void}) {
  const [open, setOpen] = useState(() => localStorage.getItem('quantsmart-first-run-v1') !== 'done');
  const finish = () => { localStorage.setItem('quantsmart-first-run-v1', 'done'); setOpen(false); };
  if (!open) return null;
  return <section className="first-run" aria-labelledby="first-run-title">
    <h1 id="first-run-title">Choose your first data source</h1>
    <p>QUANTSMART is ready. No market history is bundled. Import an OHLC CSV to inspect its chart, or connect your own MT5 terminal on Windows. Your data stays on this machine.</p>
    <div className="first-run-actions">
      <button onClick={() => { finish(); window.dispatchEvent(new CustomEvent(MT5_OPEN_DIALOG_EVENT)); }}>Connect MT5</button>
      <button onClick={() => { finish(); navigate('help'); }}>Read the guide</button>
      <button onClick={finish}>Explore without data</button>
    </div>
    <CsvImportPanel onOpen={()=>{finish();navigate('microscope');}}/>
    <small>Imported datasets stay in your local workspace. Keep your original CSV as a separate source copy.</small>
  </section>;
}
