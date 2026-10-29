export interface ToggleItem { id: string; label: string; on: boolean; }

export function LayerTogglePanel({
  title,
  items,
  onToggle,
}: {
  title: string;
  items: ToggleItem[];
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <div className="fl-section">
      <h4>{title}</h4>
      {items.map((it) => (
        <label className="fl-toggle" key={it.id}>
          <span>{it.label}</span>
          <input type="checkbox" checked={it.on} onChange={(e) => onToggle(it.id, e.target.checked)} />
        </label>
      ))}
    </div>
  );
}
