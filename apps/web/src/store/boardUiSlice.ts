import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// The board screen's interface state: what exists only in this tab and means nothing to the
// server. Server data (the board, its columns and cards) stays in TanStack Query.
//
// It lives in Redux, not in useState, so it outlives the page component: filters set on a
// board are still there after a visit to the family page, for every board visited.

// Whose cards to show: everyone's, nobody's (unassigned), or one member's (a user id)
export type AssigneeFilter = 'all' | 'nobody' | string;

export interface BoardFilters {
  // Matched against card titles and descriptions, ignoring case
  search: string;
  assignee: AssigneeFilter;
}

export interface BoardUiState {
  // The card whose dialog is open. One at a time: the dialog is modal. The board screen
  // closes it when it unmounts, so it always belongs to the board on screen
  openCardId: string | null;
  // Filters by board id. A board without an entry has no filters
  byBoard: Record<string, BoardFilters>;
}

export const noFilters: BoardFilters = { search: '', assignee: 'all' };

const initialState: BoardUiState = { openCardId: null, byBoard: {} };

export const boardUiSlice = createSlice({
  name: 'boardUi',
  initialState,
  // createSlice uses Immer: the reducers "mutate" a draft, and Immer turns that into a new
  // immutable state object. Writing state.openCardId = id here is not a real mutation
  reducers: {
    cardOpened(state, action: PayloadAction<string>) {
      // While a card is open, another one is not opened. This matters when a repeated Esc has
      // closed the dialog during a save (see CardDialog): the dialog is still mounted, waiting
      // to show the result, and opening another card would unmount it and lose that result
      if (state.openCardId === null) state.openCardId = action.payload;
    },
    cardClosed(state) {
      state.openCardId = null;
    },
    searchChanged(state, action: PayloadAction<{ boardId: string; search: string }>) {
      const { boardId, search } = action.payload;
      state.byBoard[boardId] = { ...(state.byBoard[boardId] ?? noFilters), search };
    },
    assigneeFilterChanged(
      state,
      action: PayloadAction<{ boardId: string; assignee: AssigneeFilter }>,
    ) {
      const { boardId, assignee } = action.payload;
      state.byBoard[boardId] = { ...(state.byBoard[boardId] ?? noFilters), assignee };
    },
    filtersCleared(state, action: PayloadAction<string>) {
      delete state.byBoard[action.payload];
    },
    // Logout or another user in this tab: nothing of the previous user's screen may stay
    boardUiReset() {
      return initialState;
    },
  },
});

export const {
  cardOpened,
  cardClosed,
  searchChanged,
  assigneeFilterChanged,
  filtersCleared,
  boardUiReset,
} = boardUiSlice.actions;

// The filters of one board. A board without filters gets the one constant noFilters object,
// so useSelector sees the same value every time and doesn't re-render for nothing
export function selectFilters(state: { boardUi: BoardUiState }, boardId: string): BoardFilters {
  return state.boardUi.byBoard[boardId] ?? noFilters;
}

export function filtersActive(filters: BoardFilters): boolean {
  return filters.search.trim() !== '' || filters.assignee !== 'all';
}

interface FilterableCard {
  title: string;
  description: string;
  assigneeId: string | null;
}

// A test for the cards: "does this card pass the filters?". The search text is prepared once
// here, not again for every card. Plain data in, boolean out
export function cardMatcher(filters: BoardFilters): (card: FilterableCard) => boolean {
  const search = filters.search.trim().toLowerCase();
  const { assignee } = filters;
  return (card) => {
    if (
      search &&
      !card.title.toLowerCase().includes(search) &&
      !card.description.toLowerCase().includes(search)
    ) {
      return false;
    }
    if (assignee === 'all') return true;
    if (assignee === 'nobody') return card.assigneeId === null;
    return card.assigneeId === assignee;
  };
}
