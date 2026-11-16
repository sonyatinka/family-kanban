import type { CreateFamilyRequest, FamilyDetails, FamilySummary } from '@family/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// Query keys name the data in the cache:
//   ['families']        the list of my families
//   ['families', id]    one family with its members
// queryOptions keeps the key and the fetch function together, so every useQuery for the
// same data uses the same key and gets the right type.

export const familiesQuery = queryOptions({
  queryKey: ['families'],
  queryFn: () => api<FamilySummary[]>('/families'),
});

export const familyQuery = (familyId: string) =>
  queryOptions({
    queryKey: ['families', familyId],
    // familyId comes from the URL, so it is encoded before going into the request path
    queryFn: () => api<FamilyDetails>(`/families/${encodeURIComponent(familyId)}`),
  });

export function useCreateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFamilyRequest) =>
      api<FamilyDetails>('/families', { method: 'POST', body: data }),
    // The response is the complete new family: put it into the cache, so the family page
    // opens without another request. The cached list gets it too: if the background reload
    // below fails, the home page must not offer to create a family again.
    onSuccess: (family) => {
      queryClient.setQueryData(familyQuery(family.id).queryKey, family);
      const { id, name, createdAt, myRole } = family;
      queryClient.setQueryData(
        familiesQuery.queryKey,
        (list) => list && [...list.filter((f) => f.id !== id), { id, name, createdAt, myRole }],
      );
    },
    // The list in the cache is out of date now. That is also true after an error such as
    // 409 "You are already in a family": the cached list didn't know about that family.
    // `exact` leaves the ['families', id] entries alone. The reload runs in the background:
    // the mutation doesn't wait for it, so the form can show an error or move on at once.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: familiesQuery.queryKey, exact: true });
    },
  });
}
