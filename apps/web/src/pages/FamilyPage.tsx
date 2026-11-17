import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ApiError } from '../api/client';
import { familyQuery } from '../api/families';
import { useUser } from '../api/useUser';
import { FamilyInvites } from '../components/FamilyInvites';
import { roleLabel } from './roles';

export function FamilyPage() {
  // The family is always taken from the URL, never from "the user's family": the API and
  // the web app are ready for several families per person
  const { familyId } = useParams({ from: '/authed/families/$familyId' });
  const user = useUser();
  const family = useQuery(familyQuery(familyId));

  if (family.isPending) return <p className="muted">Loading the family…</p>;

  // Data first: if a background refresh fails, the family that is already loaded stays on
  // screen. The error card shows only when there is nothing to show.
  if (!family.data) {
    // 404: no such family, or I am not a member (the API answers the same for both).
    // 400: the id in the URL is not a UUID. For the user both mean "nothing here".
    const notFound = family.error instanceof ApiError && [400, 404].includes(family.error.status);
    return (
      <div className="card stack">
        <p className="error">{notFound ? 'Family not found.' : 'Could not load the family.'}</p>
        {!notFound && <button onClick={() => void family.refetch()}>Try again</button>}
        <Link to="/">← Home</Link>
      </div>
    );
  }

  const { name, myRole, members } = family.data;
  return (
    <div className="stack">
      <Link to="/">← Home</Link>
      <h1>{name}</h1>
      <p className="muted">Your role: {roleLabel[myRole]}</p>

      <section className="card stack">
        <h2>Members</h2>
        <ul className="list">
          {members.map((member) => (
            <li key={member.userId} className="row">
              <span>
                {member.name}
                {member.userId === user?.id && <span className="muted"> (you)</span>}
                <br />
                <span className="muted small">{member.email}</span>
              </span>
              <span className="badge">{roleLabel[member.role]}</span>
            </li>
          ))}
        </ul>
      </section>

      {myRole === 'parent' && <FamilyInvites familyId={familyId} />}
    </div>
  );
}
