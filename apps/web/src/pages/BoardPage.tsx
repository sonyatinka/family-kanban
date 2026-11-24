import {
  boardNameSchema,
  columnNameSchema,
  createCardSchema,
  type BoardDetails,
  type CardInfo,
  type ColumnInfo,
} from '@family/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import {
  boardQuery,
  forgetBoard,
  useCreateCard,
  useCreateColumn,
  useDeleteBoard,
  useDeleteColumn,
  useRenameBoard,
  useRenameColumn,
} from '../api/boards';
import { ApiError } from '../api/client';
import { familyQuery } from '../api/families';
import { BoardFilters } from '../components/BoardFilters';
import { CardDialog } from '../components/CardDialog';
import { EditableName } from '../components/EditableName';
import { Field } from '../components/Field';
import {
  cardClosed,
  cardMatcher,
  cardOpened,
  filtersActive,
  filtersCleared,
  selectFilters,
} from '../store/boardUiSlice';
import { useAppDispatch, useAppSelector } from '../store/store';
import { formatDueDate, today } from './format';
import { fromApi, fromZod, noErrors } from './formErrors';

export function BoardPage() {
  const { boardId } = useParams({ from: '/authed/boards/$boardId' });
  const board = useQuery(boardQuery(boardId));

  if (board.isPending) return <p className="muted">Loading the board…</p>;

  // Data first, as on the family page: a failed background reload keeps the loaded board
  if (!board.data) {
    // 404: no such board, or I am not in its family (the API answers the same).
    // 400: the id in the URL is not a UUID. For the user both mean "nothing here"
    const notFound = board.error instanceof ApiError && [400, 404].includes(board.error.status);
    return (
      <div className="card stack">
        <p className="error">{notFound ? 'Board not found.' : 'Could not load the board.'}</p>
        {!notFound && <button onClick={() => void board.refetch()}>Try again</button>}
        <Link to="/">← Home</Link>
      </div>
    );
  }

  return <Board board={board.data} />;
}

function Board({ board }: { board: BoardDetails }) {
  const dispatch = useAppDispatch();
  // The family gives the link back and the names of the assignees. Usually it is already in
  // the cache: the user came here from the family page
  const family = useQuery(familyQuery(board.familyId));
  const members = family.data?.members;
  const names = new Map(members?.map((m) => [m.userId, m.name]));

  // Interface state from Redux: this board's filters and the open card
  const filters = useAppSelector((state) => selectFilters(state, board.id));
  const openCardId = useAppSelector((state) => state.boardUi.openCardId);
  // A deleted column goes away together with its focused Delete button; focus moves to the
  // "New column" field, which is always there, instead of falling to <body>
  const newColumnInput = useRef<HTMLInputElement>(null);
  // Leaving the board closes its card: the filters are kept for a later visit, but the dialog
  // must not pop up by itself when the user comes back
  useEffect(
    () => () => {
      dispatch(cardClosed());
    },
    [dispatch],
  );

  // Each column is filtered once per render, with one prepared matcher
  const filtered = filtersActive(filters);
  const matches = cardMatcher(filters);
  const visible = new Map(board.columns.map((c) => [c.id, c.cards.filter(matches)]));
  const total = board.columns.reduce((sum, c) => sum + c.cards.length, 0);
  const shown = [...visible.values()].reduce((sum, cards) => sum + cards.length, 0);

  // The open card is looked up in the board's data on every render, so the dialog always knows
  // the card as the server has it, including that it was deleted (then it is undefined)
  const openColumn = board.columns.find((c) => c.cards.some((card) => card.id === openCardId));
  const openCard = openColumn?.cards.find((card) => card.id === openCardId);

  return (
    <div className="board stack">
      <BoardHeader board={board} familyName={family.data?.name} cardCount={total} />
      <BoardFilters
        boardId={board.id}
        filters={filters}
        members={members}
        shown={shown}
        total={total}
      />
      <div className="board-columns">
        {board.columns.map((column) => (
          <Column
            key={column.id}
            boardId={board.id}
            column={column}
            cards={visible.get(column.id) ?? []}
            filtered={filtered}
            names={names}
            onDeleted={() => newColumnInput.current?.focus()}
          />
        ))}
        <AddColumn boardId={board.id} inputRef={newColumnInput} />
      </div>
      {openCardId && (
        <CardDialog
          key={openCardId}
          boardId={board.id}
          card={openCard}
          columnName={openColumn?.name}
          members={members}
        />
      )}
    </div>
  );
}

interface BoardHeaderProps {
  board: BoardDetails;
  familyName?: string;
  cardCount: number;
}

function BoardHeader({ board, familyName, cardCount }: BoardHeaderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const renameBoard = useRenameBoard(board);
  const deleteBoard = useDeleteBoard(board);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onDelete() {
    const what = cardCount === 1 ? '1 card' : `${cardCount} cards`;
    if (!window.confirm(`Delete the board "${board.name}" with its ${what}?`)) return;

    setDeleteError(null);
    try {
      await deleteBoard.mutateAsync();
    } catch (err) {
      // 404: the board is already gone (deleted in another tab, or by someone else in the
      // family). That is what the user wanted, so leave as after a successful delete instead
      // of keeping a board that no longer exists on screen
      const gone = err instanceof ApiError && err.status === 404;
      if (!gone) return setDeleteError(fromApi(err).form ?? 'Could not delete the board.');
    }
    // Leave the screen first, then drop the board from the cache (see forgetBoard)
    await navigate({ to: '/families/$familyId', params: { familyId: board.familyId } });
    forgetBoard(queryClient, board.id);
    // Its filters in Redux go too: they belong to a board that no longer exists
    dispatch(filtersCleared(board.id));
  }

  return (
    <header className="stack-tight">
      <Link to="/families/$familyId" params={{ familyId: board.familyId }}>
        ← {familyName ?? 'Family'}
      </Link>
      <div className="board-title">
        <EditableName
          value={board.name}
          label="Board name"
          renameLabel="Rename board"
          schema={boardNameSchema}
          save={(name) => renameBoard.mutateAsync({ name })}
        >
          <h1>{board.name}</h1>
        </EditableName>
        <button
          type="button"
          className="link danger small"
          onClick={() => void onDelete()}
          disabled={deleteBoard.isPending}
        >
          Delete board
        </button>
      </div>
      {deleteError && (
        <p className="error" role="alert">
          {deleteError}
        </p>
      )}
    </header>
  );
}

interface ColumnProps {
  boardId: string;
  column: ColumnInfo;
  // The column's cards that pass the filters, and whether any filter is on
  cards: CardInfo[];
  filtered: boolean;
  names: Map<string, string>;
  onDeleted: () => void;
}

function Column({ boardId, column, cards, filtered, names, onDeleted }: ColumnProps) {
  const renameColumn = useRenameColumn(boardId);
  const deleteColumn = useDeleteColumn(boardId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onDelete() {
    setDeleteError(null);
    try {
      await deleteColumn.mutateAsync(column.id);
    } catch (err) {
      // 409 when the column has cards: the server checks, under a lock, so a card added by
      // someone else a moment ago counts too. The message says what to do
      return setDeleteError(fromApi(err).form ?? 'Could not delete the column.');
    }
    onDeleted();
  }

  return (
    // tabIndex -1: not in the Tab order, but focusable from code. The card dialog moves focus
    // here when the tile that opened it is gone (deleted, or hidden by a filter)
    <section className="column" aria-label={column.name} data-column-id={column.id} tabIndex={-1}>
      <div className="column-head">
        <EditableName
          value={column.name}
          label="Column name"
          renameLabel={`Rename column ${column.name}`}
          schema={columnNameSchema}
          save={(name) => renameColumn.mutateAsync({ columnId: column.id, name })}
        >
          <h2>
            {column.name}{' '}
            <span className="muted small">
              {filtered ? `${cards.length} of ${column.cards.length}` : column.cards.length}
            </span>
          </h2>
        </EditableName>
        <button
          type="button"
          className="link danger small"
          aria-label={`Delete column ${column.name}`}
          onClick={() => void onDelete()}
          disabled={deleteColumn.isPending}
        >
          Delete
        </button>
      </div>
      {deleteError && (
        <p className="error small" role="alert">
          {deleteError}
        </p>
      )}

      <ul className="cards">
        {cards.map((card) => (
          <CardTile key={card.id} card={card} assignee={assigneeName(card, names)} />
        ))}
      </ul>
      {filtered && cards.length === 0 && column.cards.length > 0 && (
        <p className="muted small">No matching cards</p>
      )}

      <AddCard boardId={boardId} columnId={column.id} />
    </section>
  );
}

// The name comes from the family's members. While they load, or if loading them failed, the
// card still says that someone is assigned, instead of looking like a card for nobody
function assigneeName(card: CardInfo, names: Map<string, string>): string | null {
  if (!card.assigneeId) return null;
  return names.get(card.assigneeId) ?? 'Assigned';
}

// A card on the board. The whole tile is a button that opens the card dialog: the open card is
// interface state, so the click only dispatches an action to Redux
function CardTile({ card, assignee }: { card: CardInfo; assignee: string | null }) {
  const dispatch = useAppDispatch();
  const button = useRef<HTMLButtonElement>(null);
  // A tile that disappears while it has focus (its card was deleted, or a filter now hides it,
  // often right after the card dialog gave focus back to it) hands focus to its column.
  // Otherwise focus would fall to <body>, and a keyboard user would start again from the top.
  // A layout effect's cleanup runs before React removes the element, while it still has focus
  useLayoutEffect(() => {
    const el = button.current;
    return () => {
      if (el && document.activeElement === el) {
        el.closest<HTMLElement>('[data-column-id]')?.focus();
      }
    };
  }, []);
  // Compared as "YYYY-MM-DD" strings: both are days, no time zones involved
  const overdue = card.dueDate !== null && card.dueDate < today();
  return (
    <li>
      <button
        ref={button}
        type="button"
        className="card-tile"
        onClick={() => dispatch(cardOpened(card.id))}
      >
        <span className="card-title">{card.title}</span>
        {(assignee || card.dueDate) && (
          <span className="card-meta small">
            {assignee && <span>{assignee}</span>}
            {card.dueDate && (
              <span className={overdue ? 'error' : 'muted'}>
                {overdue ? 'Overdue: ' : 'Due '}
                <time dateTime={card.dueDate}>{formatDueDate(card.dueDate)}</time>
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}

const cardTitleSchema = createCardSchema.pick({ title: true });

// "+ Add a card" at the bottom of a column; opens a one-field form. The card goes to the end
function AddCard({ boardId, columnId }: { boardId: string; columnId: string }) {
  const createCard = useCreateCard(boardId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState(noErrors);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Only the title field of the shared schema: the same rules (trimmed, 1–200) as the API
    const parsed = cardTitleSchema.safeParse({ title });
    if (!parsed.success) return setErrors(fromZod(parsed.error));

    setErrors(noErrors);
    try {
      // Resolves once the reloaded board with the new card is in the cache (afterBoardChange)
      await createCard.mutateAsync({ columnId, title: parsed.data.title });
    } catch (err) {
      return setErrors(fromApi(err));
    }
    // The form stays open for the next card, as in most kanban tools
    setTitle('');
  }

  // Closing the form removes the focused input: focus goes back to "+ Add a card", so a
  // keyboard user doesn't land on <body>
  const openButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false;
      openButton.current?.focus();
    }
  }, [open]);

  // A closed form starts empty next time, without the errors of the last attempt. Not while
  // the request runs: its result (an error especially) would land in a form nobody sees
  function close() {
    if (createCard.isPending) return;
    returnFocus.current = true;
    setOpen(false);
    setTitle('');
    setErrors(noErrors);
  }

  if (!open) {
    return (
      <button ref={openButton} type="button" className="link small" onClick={() => setOpen(true)}>
        + Add a card
      </button>
    );
  }

  return (
    <form
      className="stack-tight"
      onSubmit={onSubmit}
      onKeyDown={(e) => e.key === 'Escape' && close()}
      noValidate
    >
      <Field
        label="Card title"
        name={`card-title-${columnId}`}
        value={title}
        autoFocus
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        errors={errors.fields.title}
      />
      {errors.form && (
        <p className="error small" role="alert">
          {errors.form}
        </p>
      )}
      <div className="row-actions">
        <button type="submit" disabled={createCard.isPending}>
          {createCard.isPending ? 'Adding…' : 'Add card'}
        </button>
        <button type="button" className="link" onClick={close} disabled={createCard.isPending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface AddColumnProps {
  boardId: string;
  inputRef: Ref<HTMLInputElement>;
}

function AddColumn({ boardId, inputRef }: AddColumnProps) {
  const createColumn = useCreateColumn(boardId);
  const [name, setName] = useState('');
  const [errors, setErrors] = useState(noErrors);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = columnNameSchema.safeParse({ name });
    if (!parsed.success) return setErrors(fromZod(parsed.error));

    setErrors(noErrors);
    try {
      await createColumn.mutateAsync(parsed.data);
    } catch (err) {
      return setErrors(fromApi(err));
    }
    setName('');
  }

  return (
    <form className="column column-new stack-tight" onSubmit={onSubmit} noValidate>
      <Field
        ref={inputRef}
        label="New column"
        name="columnName"
        value={name}
        onChange={(e) => setName(e.target.value)}
        errors={errors.fields.name}
      />
      {errors.form && (
        <p className="error small" role="alert">
          {errors.form}
        </p>
      )}
      <button type="submit" disabled={createColumn.isPending}>
        {createColumn.isPending ? 'Adding…' : 'Add column'}
      </button>
    </form>
  );
}
