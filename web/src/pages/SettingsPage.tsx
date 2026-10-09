import { useState } from 'react';
import { formatCents, parseDollarsToCents } from '../domain/money';
import { TIMEZONES } from '../components/format';
import { useStore } from '../state/useStore';

export function SettingsPage() {
  const { state, dispatch } = useStore();
  const { settings } = state;
  const [fee, setFee] = useState((settings.adminFeeEachCents / 100).toFixed(2));
  const [buffer, setBuffer] = useState(String(settings.bufferMinutes));

  function changeFee(text: string) {
    setFee(text);
    const cents = parseDollarsToCents(text === '' ? '0' : text);
    if (cents !== null && cents >= 0) dispatch({ type: 'updateSettings', settings: { adminFeeEachCents: cents } });
  }

  function changeBuffer(text: string) {
    setBuffer(text);
    const minutes = Number(text);
    if (text !== '' && Number.isInteger(minutes) && minutes >= 0 && minutes <= 240) {
      dispatch({ type: 'updateSettings', settings: { bufferMinutes: minutes } });
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="muted">Only toll settings are part of this demo.</p>
      </header>

      <div className="panel settings-section">
        <h2>Tolls</h2>

        <label className="setting">
          <span className="setting-text">
            <strong>Default statement timezone</strong>
            <span className="muted small">Toll agencies print local times. You can still change it per upload.</span>
          </span>
          <select
            value={settings.timezone}
            onChange={(e) => dispatch({ type: 'updateSettings', settings: { timezone: e.target.value } })}
          >
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>

        <label className="setting">
          <span className="setting-text">
            <strong>Review buffer (minutes)</strong>
            <span className="muted small">
              A toll this close to a pickup or return goes to review instead of being charged. Applies to statements
              you upload from now on.
            </span>
          </span>
          <input type="number" min="0" max="240" step="5" value={buffer} onChange={(e) => changeBuffer(e.target.value)} />
        </label>

        <label className="setting">
          <span className="setting-text">
            <strong>Admin fee per toll</strong>
            <span className="muted small">
              Added to each toll you charge, currently {formatCents(settings.adminFeeEachCents)}. Any admin fee must be
              disclosed in your rental agreement. Applies to charges you haven’t approved yet.
            </span>
          </span>
          <input type="number" min="0" step="0.01" value={fee} onChange={(e) => changeFee(e.target.value)} />
        </label>
      </div>
    </section>
  );
}
