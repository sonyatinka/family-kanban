import {
  createInviteSchema,
  INVITE_LIFETIMES_DAYS,
  type CreatedInvite,
  type FamilyRole,
} from '@family/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { invitesQuery, useCreateInvite, useRevokeInvite } from '../api/invites';
import { formatDateTime } from '../pages/format';
import { fromApi, fromZod, noErrors } from '../pages/formErrors';
import { roleLabel } from '../pages/roles';

const ROLES: FamilyRole[] = ['child', 'parent', 'guest'];

// Invites on the family page. FamilyPage shows this block to parents only; the API checks
// the role again, so hiding it is a convenience, not the protection.
export function FamilyInvites({ familyId }: { familyId: string }) {
  const invites = useQuery(invitesQuery(familyId));
  const createInvite = useCreateInvite(familyId);
  const revokeInvite = useRevokeInvite(familyId);

  const [role, setRole] = useState<FamilyRole>('child');
  const [days, setDays] = useState<number>(7);
  const [errors, setErrors] = useState(noErrors);
  // The token is known only right after creation: the API stores just its hash.
  // `created` is the newest invite, shown above the list. `links` keeps every link made while
  // this page is open, so a parent who made two can still copy the first one. They live in
  // memory only (not localStorage): after a reload they are gone, as on the server.
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = createInviteSchema.safeParse({ role, expiresInDays: days });
    if (!parsed.success) return setErrors(fromZod(parsed.error));

    setErrors(noErrors);
    setCreated(null);
    let invite;
    try {
      invite = await createInvite.mutateAsync(parsed.data);
    } catch (err) {
      return setErrors(fromApi(err));
    }
    setCreated(invite);
    setLinks((prev) => ({ ...prev, [invite.id]: inviteLink(invite.token) }));
  }

  async function onRevoke(inviteId: string) {
    setRevokeError(null);
    try {
      await revokeInvite.mutateAsync(inviteId);
      // The link no longer works, so don't offer it for copying
      if (created?.id === inviteId) setCreated(null);
      setLinks((prev) => {
        const next = { ...prev };
        delete next[inviteId];
        return next;
      });
    } catch (err) {
      setRevokeError(fromApi(err).form ?? 'Could not revoke the invite.');
    }
  }

  return (
    <section className="card stack">
      <h2>Invite to the family</h2>

      <form className="stack" onSubmit={onSubmit} noValidate>
        <div className="fields-row">
          <label className="field">
            <span>Role</span>
            <select
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as FamilyRole)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
            {errors.fields.role && <span className="error">{errors.fields.role.join('. ')}</span>}
          </label>
          <label className="field">
            <span>Link works for</span>
            <select
              name="expiresInDays"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {INVITE_LIFETIMES_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d === 1 ? '1 day' : `${d} days`}
                </option>
              ))}
            </select>
            {errors.fields.expiresInDays && (
              <span className="error">{errors.fields.expiresInDays.join('. ')}</span>
            )}
          </label>
        </div>
        {errors.form && (
          <p className="error" role="alert">
            {errors.form}
          </p>
        )}
        <button type="submit" disabled={createInvite.isPending}>
          {createInvite.isPending ? 'Creating…' : 'Create invite link'}
        </button>
      </form>

      {created && <NewInviteLink invite={created} />}

      <h3>Active invites</h3>
      {invites.isPending && <p className="muted">Loading invites…</p>}
      {invites.isError && !invites.data && <p className="error">Could not load the invites.</p>}
      {invites.data?.length === 0 && <p className="muted small">No active invites.</p>}
      {invites.data && invites.data.length > 0 && (
        <ul className="list">
          {invites.data.map((invite) => (
            <li key={invite.id} className="row">
              <span>
                {roleLabel[invite.role]}, until {formatDateTime(invite.expiresAt)}
                <br />
                <span className="muted small">Created by {invite.createdByName}</span>
              </span>
              <span className="row-actions">
                {links[invite.id] ? (
                  <CopyButton text={links[invite.id]} label="Copy link" />
                ) : (
                  <span className="muted small">Link not available</span>
                )}
                <button
                  className="link"
                  onClick={() => void onRevoke(invite.id)}
                  disabled={revokeInvite.isPending}
                >
                  Revoke
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {invites.data?.some((invite) => !links[invite.id]) && (
        <p className="muted small">
          Links are shown only when created. If one is lost, revoke it and create a new one.
        </p>
      )}
      {revokeError && (
        <p className="error" role="alert">
          {revokeError}
        </p>
      )}
    </section>
  );
}

function inviteLink(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

// A small button that copies a link from the list
function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Don't leave a timer running after the button is gone
  useEffect(() => () => clearTimeout(timer.current), []);

  function copy() {
    navigator.clipboard.writeText(text).then(
      () => setState('copied'),
      () => setState('failed'),
    );
    // Back to the normal label after a moment. A second click starts the wait again,
    // instead of the first click's timer cutting the second label short
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button type="button" className="link" onClick={copy}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}

// The link of a just created invite, with a copy button
function NewInviteLink({ invite }: { invite: CreatedInvite }) {
  const link = inviteLink(invite.token);
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(link).then(
      () => setCopied(true),
      // No clipboard access: select the text, so the user can copy it by hand
      () => input.current?.select(),
    );
  }

  return (
    <div className="stack">
      <div className="copy-link">
        <input
          ref={input}
          aria-label="Invite link"
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="muted small">
        Send this link to the person you invite. It works once, until{' '}
        {formatDateTime(invite.expiresAt)}. While this page is open, you can also copy it from the
        list below; after you leave, it can&apos;t be shown again.
      </p>
    </div>
  );
}
