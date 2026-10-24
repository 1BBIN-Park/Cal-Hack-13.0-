import { tables } from './module_bindings';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';

// Placeholder until the Scan, Pairing, and Family screens land. Shows that the
// client is connected and subscribed to the (DRAFT) verdict table.
function App() {
  const { isActive: connected } = useSpacetimeDB();
  const [verdicts] = useTable(tables.verdict);

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Scam app check</h1>

      <div style={{ marginBottom: '1rem' }}>
        Status:{' '}
        <strong style={{ color: connected ? 'green' : 'red' }}>
          {connected ? 'Connected' : 'Disconnected'}
        </strong>
      </div>

      <h2>Verdicts ({verdicts.length})</h2>
      {verdicts.length === 0 ? (
        <p>No alerts yet / 暂无警报</p>
      ) : (
        <ul>
          {verdicts.map(v => (
            <li key={v.id.toString()}>
              [{v.riskLevel}] {v.appName} ({v.sessionId}): {v.explanationEn}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;
