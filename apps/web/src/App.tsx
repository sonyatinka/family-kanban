import { useEffect, useState } from 'react';
import type { HealthResponse } from '@family/shared';

type State =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: HealthResponse };

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    // TanStack Query will replace this in stage 2
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<HealthResponse>;
      })
      .then((data) => setState({ kind: 'ok', data }))
      .catch((err: Error) => setState({ kind: 'error', message: err.message }));
  }, []);

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 480,
        margin: '4rem auto',
        padding: '0 16px',
      }}
    >
      <h1>Family Kanban</h1>
      {state.kind === 'loading' && <p>Checking the API…</p>}
      {state.kind === 'error' && (
        <p style={{ color: 'crimson' }}>
          The API is unavailable: {state.message}. Is <code>pnpm dev</code> running?
        </p>
      )}
      {state.kind === 'ok' && (
        <ul>
          <li>API: {state.data.status === 'ok' ? '✅ running' : '⚠️ degraded'}</li>
          <li>PostgreSQL: {state.data.services.database === 'up' ? '✅' : '❌'}</li>
          <li>Redis: {state.data.services.redis === 'up' ? '✅' : '❌'}</li>
        </ul>
      )}
    </main>
  );
}
