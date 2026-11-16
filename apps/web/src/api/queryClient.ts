import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

// One cache of server data for the whole app. Components ask for data by key (useQuery),
// and the client decides whether to use the cached copy or go to the API.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // For 30 seconds cached data counts as fresh and is not refetched on every mount.
      // After that it is "stale": still shown at once, but refreshed in the background.
      staleTime: 30_000,
      // A 4xx answer (not found, forbidden, invalid) will be the same next time, so retrying
      // only delays the error message. Network failures, 5xx and the two temporary 4xx
      // (408 timeout, 429 too many requests) get two more attempts.
      retry: (failureCount, error) => {
        const permanent =
          error instanceof ApiError && error.status < 500 && ![408, 429].includes(error.status);
        return !permanent && failureCount < 2;
      },
      // By default a request is paused while the browser reports "offline", and the page
      // shows a loader with no end. 'always' sends it anyway: it fails like any network
      // error, and the page shows its error with "Try again". The browser's offline flag
      // also says nothing about an API on localhost.
      networkMode: 'always',
    },
    mutations: { networkMode: 'always' },
  },
});
