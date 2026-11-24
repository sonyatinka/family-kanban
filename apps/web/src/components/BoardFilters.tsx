import type { FamilyMemberInfo } from '@family/shared';
import { useRef } from 'react';
import { useUser } from '../api/useUser';
import {
  assigneeFilterChanged,
  filtersActive,
  filtersCleared,
  searchChanged,
  type BoardFilters as Filters,
} from '../store/boardUiSlice';
import { useAppDispatch } from '../store/store';

interface BoardFiltersProps {
  boardId: string;
  filters: Filters;
  members: FamilyMemberInfo[] | undefined;
  shown: number;
  total: number;
}

// The filter bar above the columns. Every change is an action dispatched to Redux; the board
// reads the filters back with a selector and hides the cards that don't match
export function BoardFilters({ boardId, filters, members, shown, total }: BoardFiltersProps) {
  const dispatch = useAppDispatch();
  const me = useUser();
  const others = members?.filter((m) => m.userId !== me?.id) ?? [];
  const active = filtersActive(filters);
  // The filters outlive the page, so the chosen member may be missing from the options: they
  // left the family, or the members are not loaded. A select with no matching option would
  // show "Everyone" while still hiding cards, so the value gets an option of its own
  const known =
    ['all', 'nobody', me?.id].includes(filters.assignee) ||
    others.some((m) => m.userId === filters.assignee);
  // "Clear filters" disappears as soon as it works (no filters, no button), taking the focus
  // with it; focus moves to the search field instead of falling to <body>
  const searchInput = useRef<HTMLInputElement>(null);

  function clear() {
    dispatch(filtersCleared(boardId));
    searchInput.current?.focus();
  }

  return (
    <div className="board-filters" role="search">
      <label className="field">
        <span>Search cards</span>
        <input
          ref={searchInput}
          type="search"
          name="search"
          value={filters.search}
          placeholder="Title or description"
          onChange={(e) => dispatch(searchChanged({ boardId, search: e.target.value }))}
        />
      </label>
      <label className="field">
        <span>Assignee</span>
        <select
          name="assignee"
          value={filters.assignee}
          onChange={(e) => dispatch(assigneeFilterChanged({ boardId, assignee: e.target.value }))}
        >
          <option value="all">Everyone</option>
          {me && <option value={me.id}>Me</option>}
          <option value="nobody">Nobody</option>
          {others.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
          {!known && <option value={filters.assignee}>Unknown member</option>}
        </select>
      </label>
      <p className="board-filters-status small">
        {/* A live region: screen readers read out changes of its text. It is always on the
            page, only its text changes; a region that appears together with its text is
            usually not announced, and the first "Showing…" would be silent */}
        <span className="muted" role="status">
          {active ? `Showing ${shown} of ${total} cards` : ''}
        </span>
        {active && (
          <button type="button" className="link" onClick={clear}>
            Clear filters
          </button>
        )}
      </p>
    </div>
  );
}
