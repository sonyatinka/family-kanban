import type {
  BoardDetails,
  BoardNameRequest,
  BoardSummary,
  CardInfo,
  ColumnNameRequest,
  ColumnSummary,
  UpdateCardRequest,
} from '@family/shared';
import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';

// Query keys:
//   ['families', familyId, 'boards']   a family's boards (without columns)
//   ['boards', boardId]                one board with its columns and cards
// The board screen needs everything at once, and the API gives it in one request, so a board
// is one cache entry. Every change to a column or a card reloads that entry.

const enc = encodeURIComponent;

export const boardsQuery = (familyId: string) =>
  queryOptions({
    queryKey: ['families', familyId, 'boards'],
    queryFn: () => api<BoardSummary[]>(`/families/${enc(familyId)}/boards`),
  });

export const boardQuery = (boardId: string) =>
  queryOptions({
    queryKey: ['boards', boardId],
    // boardId comes from the URL, so it is encoded before going into the request path
    queryFn: () => api<BoardDetails>(`/boards/${enc(boardId)}`),
  });

function reloadBoard(queryClient: QueryClient, boardId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: boardQuery(boardId).queryKey });
}

function reloadBoards(queryClient: QueryClient, familyId: string) {
  void queryClient.invalidateQueries({ queryKey: boardsQuery(familyId).queryKey });
}

// The board is out of date after any change to it, also after an error: the request may have
// reached the server, and only the answer was lost (or someone else changed the board, which
// is what a 409 means).
// After a success the mutation waits for the reload: TanStack Query awaits a promise returned
// from onSuccess, so mutateAsync resolves only when the new board is in the cache. React gets
// it a moment later (TanStack Query notifies components with setTimeout(0)), so the screen
// catches up within the same frame or the next. Without the wait, a form would close or clear
// for the whole length of the reload while the old board is shown: a cleared "Add card" form
// with no new card invites a second, duplicate card. (invalidateQueries resolves even if the
// reload fails; the page then keeps the old data, as everywhere.) After an error the reload
// runs in the background, so the error message shows at once.
// Step 5 replaces the wait with optimistic updates.
function afterBoardChange(queryClient: QueryClient, boardId: string) {
  return {
    onSuccess: () => reloadBoard(queryClient, boardId),
    onError: () => void reloadBoard(queryClient, boardId),
  };
}

export function useCreateBoard(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BoardNameRequest) =>
      api<BoardDetails>(`/families/${enc(familyId)}/boards`, { method: 'POST', body: data }),
    // The answer is the complete new board: its screen opens without another request
    onSuccess: (board) => {
      queryClient.setQueryData(boardQuery(board.id).queryKey, board);
    },
    onSettled: () => reloadBoards(queryClient, familyId),
  });
}

export function useRenameBoard(board: { id: string; familyId: string }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BoardNameRequest) =>
      api<BoardSummary>(`/boards/${enc(board.id)}`, { method: 'PATCH', body: data }),
    ...afterBoardChange(queryClient, board.id),
    // The family page's list shows the name too; it is not on screen, so no need to wait
    onSettled: () => reloadBoards(queryClient, board.familyId),
  });
}

// The caller leaves the board screen first and then calls forgetBoard: removing the entry while
// the screen still shows it would make the screen load the deleted board again (and get a 404)
export function useDeleteBoard(board: { id: string; familyId: string }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/boards/${enc(board.id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.setQueryData(boardsQuery(board.familyId).queryKey, (list) =>
        list?.filter((b) => b.id !== board.id),
      );
    },
    onSettled: () => reloadBoards(queryClient, board.familyId),
  });
}

// A deleted board must not stay in the cache: the page shows cached data before errors, so
// going back in history would show the deleted board again
export function forgetBoard(queryClient: QueryClient, boardId: string) {
  queryClient.removeQueries({ queryKey: boardQuery(boardId).queryKey });
}

export function useCreateColumn(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ColumnNameRequest) =>
      api<ColumnSummary>(`/boards/${enc(boardId)}/columns`, { method: 'POST', body: data }),
    ...afterBoardChange(queryClient, boardId),
  });
}

export function useRenameColumn(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ columnId, ...data }: ColumnNameRequest & { columnId: string }) =>
      api<ColumnSummary>(`/columns/${enc(columnId)}`, { method: 'PATCH', body: data }),
    ...afterBoardChange(queryClient, boardId),
  });
}

export function useDeleteColumn(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (columnId: string) => api<void>(`/columns/${enc(columnId)}`, { method: 'DELETE' }),
    ...afterBoardChange(queryClient, boardId),
  });
}

export function useCreateCard(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // Only the title for now; the description, assignee and due date are edited in the card
    // dialog. The API fills the rest with its defaults
    mutationFn: ({ columnId, title }: { columnId: string; title: string }) =>
      api<CardInfo>(`/columns/${enc(columnId)}/cards`, { method: 'POST', body: { title } }),
    ...afterBoardChange(queryClient, boardId),
  });
}

// PATCH with only the changed fields: null clears the assignee or the due date
export function useUpdateCard(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, ...data }: UpdateCardRequest & { cardId: string }) =>
      api<CardInfo>(`/cards/${enc(cardId)}`, { method: 'PATCH', body: data }),
    ...afterBoardChange(queryClient, boardId),
  });
}

export function useDeleteCard(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) => api<void>(`/cards/${enc(cardId)}`, { method: 'DELETE' }),
    ...afterBoardChange(queryClient, boardId),
  });
}
