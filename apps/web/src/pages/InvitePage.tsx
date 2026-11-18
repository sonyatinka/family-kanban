import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { invitePreviewQuery, useAcceptInvite } from '../api/invites';
import { formatDateTime } from './format';
import { fromApi } from './formErrors';
import { roleLabel } from './roles';

// The page an invite link opens. It is under the protected routes: a guest is sent to the
// login page first and comes back here afterwards through ?redirect=
export function InvitePage() {
  const { token } = useParams({ from: '/authed/invite/$token' });
  const navigate = useNavigate();
  const preview = useQuery(invitePreviewQuery(token));
  const accept = useAcceptInvite(token);
  const [error, setError] = useState<string | null>(null);

  async function onJoin() {
    setError(null);
    let family;
    try {
      family = await accept.mutateAsync();
    } catch (err) {
      return setError(fromApi(err).form ?? 'Could not join the family.');
    }
    void navigate({ to: '/families/$familyId', params: { familyId: family.id } });
  }

  if (preview.isPending) return <p className="muted">Checking the invite…</p>;

  if (!preview.data) {
    // The API answers 404 for every link that doesn't work, whatever the reason
    const dead = preview.error instanceof ApiError && preview.error.status === 404;
    return (
      <div className="card stack">
        <p className="error">
          {dead ? 'This invite link does not work.' : 'Could not check the invite.'}
        </p>
        {dead ? (
          <p className="muted">
            It may have expired, been used or been revoked. Ask for a new link.
          </p>
        ) : (
          <button onClick={() => void preview.refetch()}>Try again</button>
        )}
        <Link to="/">← Home</Link>
      </div>
    );
  }

  const { familyId, alreadyMember, familyName, invitedByName, role, expiresAt } = preview.data;

  // Pressing "Join" would only get a 409, and the link would stay for its real recipient
  if (alreadyMember) {
    return (
      <section className="card stack">
        <h1>{familyName}</h1>
        <p>You are already in this family. This link is meant for someone else.</p>
        <Link to="/families/$familyId" params={{ familyId }}>
          Open the family
        </Link>
      </section>
    );
  }

  return (
    <section className="card stack">
      <h1>Join {familyName}</h1>
      <p>
        {invitedByName} invites you to the family as <b>{roleLabel[role]}</b>.
      </p>
      <p className="muted small">The link works once, until {formatDateTime(expiresAt)}.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button onClick={() => void onJoin()} disabled={accept.isPending}>
        {accept.isPending ? 'Joining…' : 'Join family'}
      </button>
      <Link to="/">Not now</Link>
    </section>
  );
}
