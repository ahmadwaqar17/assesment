import { useRef, useState, type DragEvent } from 'react';
import { parseStatement } from '../domain/statement';
import { TIMEZONES } from '../components/format';
import { nowIso } from '../state/clock';
import { useStore } from '../state/useStore';

const SAMPLE_URL = '/sample-tolls.csv';

interface Props {
  onImported: () => void;
}

export function UploadPage({ onImported }: Props) {
  const { state, dispatch } = useStore();
  const [timezone, setTimezone] = useState(state.settings.timezone);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState<{ fileName: string; errors: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function importText(text: string, fileName: string) {
    const parsed = parseStatement(text, timezone);
    if (!parsed.ok) {
      setFailed({ fileName, errors: parsed.errors });
      return;
    }
    setFailed(null);
    dispatch({
      type: 'importStatement',
      uploadId: `upload-${Date.now()}`,
      fileName,
      timezone,
      importedAt: nowIso(),
      tolls: parsed.tolls,
    });
    onImported();
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      importText(await file.text(), file.name);
    } catch {
      setFailed({ fileName: file.name, errors: ['The file could not be read.'] });
    }
  }

  async function loadSample() {
    try {
      const response = await fetch(SAMPLE_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      importText(await response.text(), 'sample-tolls.csv');
    } catch {
      setFailed({ fileName: 'sample-tolls.csv', errors: ['The sample statement could not be loaded.'] });
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void importFile(event.dataTransfer.files[0]);
  }


  return (
    <section className="page">
      <header className="page-header">
        <h2>Upload a toll statement</h2>
      </header>

      <div className="panel upload-panel">
        <label className="field">
          <span>Statement timezone</span>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace('_', ' ')}
              </option>
            ))}
          </select>
          <small className="muted">Times on the statement are read as local time in this zone. Your default is set in Settings.</small>
        </label>

        <div
          className={`dropzone${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        >
          <strong>Drop a CSV here</strong>
          <span className="muted">or click to choose a file</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        <div className="upload-actions">
          <button className="button" onClick={() => void loadSample()}>
            Use sample statement
          </button>
          <a className="link" href={SAMPLE_URL} download="sample-tolls.csv">
            Download sample CSV
          </a>
          <span className="muted small">
            Columns: plate, datetime (YYYY-MM-DD HH:mm), plaza, amount, transaction_id
          </span>
        </div>
      </div>

      {failed && (
        <div className="panel error-panel" role="alert">
          <h2>Couldn’t import {failed.fileName}</h2>
          <p>Nothing was imported. Fix these rows and upload the file again.</p>
          <ul className="error-list">
            {failed.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {state.uploads.length > 0 && (
        <div className="panel">
          <h2>Previous uploads</h2>
          <table className="table">
            <thead>
              <tr>
                <th>File</th>
                <th>Timezone</th>
                <th>Imported</th>
                <th className="num">Rows</th>
              </tr>
            </thead>
            <tbody>
              {[...state.uploads].reverse().map((upload) => (
                <tr key={upload.id}>
                  <td>{upload.fileName}</td>
                  <td>{upload.timezone}</td>
                  <td>{new Date(upload.importedAt).toLocaleString()}</td>
                  <td className="num">{upload.rowCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
