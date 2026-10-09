import { formatCents, sumCents } from '../domain/money';
import { tollsByCar, type CarTolls } from '../state/selectors';
import { useStore } from '../state/useStore';

const COLUMNS: { key: keyof CarTolls; label: string }[] = [
  { key: 'recoveredCents', label: 'Recovered' },
  { key: 'outstandingCents', label: 'Renter owes' },
  { key: 'turoCents', label: 'File with Turo' },
  { key: 'reviewCents', label: 'In review' },
  { key: 'absorbedCents', label: 'You absorbed' },
];

export function FleetPage() {
  const { state } = useStore();
  const cars = tollsByCar(state);
  const total = (key: keyof CarTolls) => sumCents(cars.map((c) => c[key] as number));
  const money = (value: number) => (value === 0 ? <span className="muted">—</span> : formatCents(value));

  return (
    <section className="page">
      <header className="page-header">
        <h1>Fleet</h1>
        <p className="muted">
          Tolls per car. What you absorbed is a real cost on that car and comes out of its profit.
        </p>
      </header>

      <div className="panel flush">
        <table className="table">
          <thead>
            <tr>
              <th>Car</th>
              <th>Plate</th>
              <th className="num">Tolls</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="num">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cars.map((car) => (
              <tr key={car.plate}>
                <td>{car.car}</td>
                <td className="mono">{car.plate}</td>
                <td className="num">
                  {money(car.totalCents)} {car.tollCount > 0 && <span className="muted small">({car.tollCount})</span>}
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className={`num${c.key === 'absorbedCents' && car.absorbedCents > 0 ? ' cost' : ''}`}>
                    {money(car[c.key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>All cars</td>
              <td className="num">{formatCents(total('totalCents'))}</td>
              {COLUMNS.map((c) => (
                <td key={c.key} className="num">
                  {formatCents(total(c.key))}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {state.uploads.length === 0 && (
        <p className="muted small">No toll statements yet. Upload one under Tolls to fill this in.</p>
      )}
    </section>
  );
}
