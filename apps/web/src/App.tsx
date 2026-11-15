import { RouterProvider } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { refreshSession, subscribe } from './api/client';
import { router } from './router';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  // Before showing any route, find out whether the user is logged in. The access token is
  // only in memory and is gone after a reload, but the refresh cookie survives it.
  // StrictMode runs this effect twice in development; refreshSession shares one request.
  const start = useCallback(() => {
    setState({ kind: 'loading' });
    refreshSession()
      .then(() => setState({ kind: 'ready' }))
      .catch(() => setState({ kind: 'error', message: 'Cannot reach the server' }));
  }, []);
  useEffect(start, [start]);

  // Login, logout or an expired session: re-run the route guards, so the user is
  // redirected to the right page
  useEffect(() => subscribe(() => void router.invalidate()), []);

  if (state.kind === 'loading') return <p className="center muted">Loading…</p>;
  if (state.kind === 'error') {
    return (
      <div className="center stack">
        <p className="error">{state.message}. Is the API running?</p>
        <button onClick={start}>Try again</button>
      </div>
    );
  }
  return <RouterProvider router={router} />;
}
