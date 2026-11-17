import type {
  CreatedInvite,
  CreateInviteRequest,
  FamilyDetails,
  InvitePreview,
  InviteSummary,
} from '@family/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { familiesQuery, rememberFamily } from './families';

// Query keys:
//   ['families', id, 'invites']   a family's invites that still work (parents only)
//   ['invites', token]            what an invite link offers

const invitesPath = (familyId: string) => `/families/${encodeURIComponent(familyId)}/invites`;

export const invitesQuery = (familyId: string) =>
  queryOptions({
    queryKey: ['families', familyId, 'invites'],
    queryFn: () => api<InviteSummary[]>(invitesPath(familyId)),
  });

// Both mutations change the list, so it is reloaded after them, after an error too
// (for example, revoking an invite that someone has just used)

export function useCreateInvite(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInviteRequest) =>
      api<CreatedInvite>(invitesPath(familyId), { method: 'POST', body: data }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: invitesQuery(familyId).queryKey });
    },
  });
}

export function useRevokeInvite(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      api<void>(`${invitesPath(familyId)}/${encodeURIComponent(inviteId)}`, { method: 'DELETE' }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: invitesQuery(familyId).queryKey });
    },
  });
}

export const invitePreviewQuery = (token: string) =>
  queryOptions({
    queryKey: ['invites', token],
    // The token comes from the URL, so it is encoded before going into the request path
    queryFn: () => api<InvitePreview>(`/invites/${encodeURIComponent(token)}`),
    // An invite can be used or revoked at any moment: never trust a cached answer
    staleTime: 0,
  });

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<FamilyDetails>(`/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' }),
    // Like creating a family: the response is the joined family
    onSuccess: (family) => rememberFamily(queryClient, family),
    // The list of my families has changed. Reloaded after an error too: the request may have
    // reached the server, and only the answer was lost on the way
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: familiesQuery.queryKey, exact: true });
    },
  });
}
