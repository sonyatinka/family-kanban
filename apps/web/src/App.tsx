import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { getUser, refreshSession, subscribe } from './api/client';
import { queryClient } from './api/queryClient';
import { router } from './router';
import { boardUiReset } from './store/boardUiSlice';
import { store } from './store/store';

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

  useEffect(() => {
    let userId = getUser()?.id;
    return subscribe(() => {
      const id = getUser()?.id;
      const changed = id !== userId;
      userId = id;
      // Another user took over this tab (for example, they logged in in a second tab and
      // the shared refresh cookie brought their session here). resetQueries drops the cached
      // data and makes the pages on screen load again as the new user; clear() would leave
      // the previous user's data in the mounted pages. A token refresh keeps the same user
      // and the cache.
      if (changed && id) void queryClient.resetQueries();
      // The interface state (open card, filters) belongs to the previous user too: a new user,
      // or nobody after a logout, starts with a clean board screen
      if (changed) store.dispatch(boardUiReset());
      // Login, logout or an expired session: re-run the route guards, so the user is
      // redirected to the right page. After a logout the cache is emptied only then: while
      // the protected pages are still on screen, they would refetch at once, without a token.
      // The same on a failed invalidate: the cache of a logged-out user must not stay.
      const afterGuards = () => {
        if (!getUser()) queryClient.clear();
      };
      void router.invalidate().then(afterGuards, afterGuards);
    });
  }, []);

  if (state.kind === 'loading') return <p className="center muted">Loading…</p>;
  if (state.kind === 'error') {
    return (
      <div className="center stack">
        <p className="error">{state.message}. Is the API running?</p>
        <button onClick={start}>Try again</button>
      </div>
    );
  }
  return (
    // Two separate stores: TanStack Query for server data, Redux for the interface state
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ReduxProvider>
  );
}
