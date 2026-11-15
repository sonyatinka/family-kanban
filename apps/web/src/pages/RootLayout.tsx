import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import { logout } from '../api/client';
import { useUser } from '../api/useUser';

export function RootLayout() {
  const user = useUser();
  const [leaving, setLeaving] = useState(false);

  async function onLogout() {
    setLeaving(true);
    // After logout the session is null, and the route guard sends the user to /login
    await logout().finally(() => setLeaving(false));
  }

  return (
    <>
      <header className="topbar">
        <span className="brand">Family Kanban</span>
        {user && (
          <span className="topbar-user">
            <span className="muted">{user.name}</span>
            <button className="link" onClick={onLogout} disabled={leaving}>
              Log out
            </button>
          </span>
        )}
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
