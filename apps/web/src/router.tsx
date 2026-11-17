import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { getUser, hasLoggedOut } from './api/client';
import { FamilyPage } from './pages/FamilyPage';
import { HomePage } from './pages/HomePage';
import { InvitePage } from './pages/InvitePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { RootLayout } from './pages/RootLayout';

// Routes are declared in code (no file-based generation), so the whole tree is visible here.
//
//   root
//   ├── authed (no path)   only for logged-in users  → /, /families/$familyId, /invite/$token
//   └── guest  (no path)   only for guests           → /login, /register

const rootRoute = createRootRoute({ component: RootLayout });

// Protected routes. beforeLoad runs before every navigation into them. The session lives in
// the client module, so the check is synchronous and never sees stale React state.
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  beforeLoad: ({ location }) => {
    if (!getUser()) {
      // Remember where the user was going, to come back after login. Not after "Log out":
      // the next person to log in may be someone else, and this page is not theirs.
      throw redirect({
        to: '/login',
        search: { redirect: hasLoggedOut() ? undefined : location.href },
      });
    }
  },
});

const homeRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  component: HomePage,
});

const familyRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/families/$familyId',
  component: FamilyPage,
});

// The page an invite link opens. Protected like the others: a guest logs in or signs up
// first and comes back here through ?redirect=
const inviteRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/invite/$token',
  component: InvitePage,
});

interface GuestSearch {
  redirect?: string;
}

// Login and sign-up. A logged-in user is sent on to where they were going. This also does
// the redirect right after a successful login: the session changes, App calls
// router.invalidate(), and this beforeLoad runs again.
const guestRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'guest',
  validateSearch: (search: Record<string, unknown>): GuestSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (getUser()) throw redirect({ href: safeRedirect(search.redirect) });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => guestRoute,
  path: '/login',
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => guestRoute,
  path: '/register',
  component: RegisterPage,
});

// ?redirect= comes from the URL, and anyone can craft a link. Only same-site paths are allowed,
// otherwise /login?redirect=https://evil.example would send the user to a phishing site
// right after a real login (an open redirect). "//evil.example" is also an external URL.
function safeRedirect(target: string | undefined): string {
  if (target && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')) {
    return target;
  }
  return '/';
}

const routeTree = rootRoute.addChildren([
  authedRoute.addChildren([homeRoute, familyRoute, inviteRoute]),
  guestRoute.addChildren([loginRoute, registerRoute]),
]);

export const router = createRouter({ routeTree });

// Registers the router type, so <Link to="..."> and navigate() are checked against real routes
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
