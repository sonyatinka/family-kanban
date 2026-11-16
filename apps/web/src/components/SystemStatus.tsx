import { useQuery } from '@tanstack/react-query';
import { healthQuery } from '../api/health';

// The health check from stage 0, now as a query: no useState and useEffect by hand
export function SystemStatus() {
  const health = useQuery(healthQuery);

  // Here the cached answer never wins: while a check is running, or after a failed one, an
  // old "running" would be a lie
  let body;
  if (health.isPending || health.isFetching) body = <p className="muted">Checking…</p>;
  else if (health.isError) body = <p className="error">The API is unavailable</p>;
  else {
    body = (
      <ul className="status">
        <li>API: {health.data.status === 'ok' ? '✅ running' : '⚠️ degraded'}</li>
        <li>PostgreSQL: {health.data.services.database === 'up' ? '✅' : '❌'}</li>
        <li>Redis: {health.data.services.redis === 'up' ? '✅' : '❌'}</li>
      </ul>
    );
  }

  return (
    <section className="card stack">
      <h2>System status</h2>
      {body}
    </section>
  );
}
