import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { familiesQuery } from '../api/families';
import { useUser } from '../api/useUser';
import { CreateFamilyForm } from '../components/CreateFamilyForm';
import { SystemStatus } from '../components/SystemStatus';
import { roleLabel } from './roles';

export function HomePage() {
  const user = useUser();
  const families = useQuery(familiesQuery);

  return (
    <div className="stack">
      <h1>Hi, {user?.name}</h1>

      {/* Data first: if a background refresh fails, the list that is already loaded stays on
          screen. The error card shows only when there is nothing to show. */}
      {families.isPending && <p className="muted">Loading your families…</p>}
      {families.isError && !families.data && (
        <div className="card stack">
          <p className="error">Could not load your families.</p>
          <button onClick={() => void families.refetch()}>Try again</button>
        </div>
      )}
      {/* The API returns a list, although the database allows one family per user for now.
          The form shows only for an empty list: a second family would get a 409. */}
      {families.data?.length === 0 && <CreateFamilyForm />}
      {families.data && families.data.length > 0 && (
        <section className="card stack">
          <h2>Your families</h2>
          <ul className="list">
            {families.data.map((family) => (
              <li key={family.id} className="row">
                <Link to="/families/$familyId" params={{ familyId: family.id }}>
                  {family.name}
                </Link>
                <span className="badge">{roleLabel[family.myRole]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SystemStatus />
    </div>
  );
}
