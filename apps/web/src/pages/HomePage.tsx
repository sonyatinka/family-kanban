import type { HealthResponse } from '@family/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useUser } from '../api/useUser';

type Health = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; data: HealthResponse };

export function HomePage() {
  const user = useUser();
  const [health, setHealth] = useState<Health>({ kind: 'loading' });

  useEffect(() => {
    // TanStack Query will replace this hand-written fetch in part 2 of step 6
    api<HealthResponse>('/health')
      .then((data) => setHealth({ kind: 'ok', data }))
      .catch(() => setHealth({ kind: 'error' }));
  }, []);

  return (
    <div className="stack">
      <h1>Hi, {user?.name}</h1>
      <p className="muted">Your family will appear here soon.</p>

      <section className="card stack">
        <h2>System status</h2>
        {health.kind === 'loading' && <p className="muted">Checking…</p>}
        {health.kind === 'error' && <p className="error">The API is unavailable</p>}
        {health.kind === 'ok' && (
          <ul className="status">
            <li>API: {health.data.status === 'ok' ? '✅ running' : '⚠️ degraded'}</li>
            <li>PostgreSQL: {health.data.services.database === 'up' ? '✅' : '❌'}</li>
            <li>Redis: {health.data.services.redis === 'up' ? '✅' : '❌'}</li>
          </ul>
        )}
      </section>
    </div>
  );
}
