import {
  updateCardSchema,
  type CardInfo,
  type FamilyMemberInfo,
  type UpdateCardRequest,
} from '@family/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { boardQuery, useDeleteCard, useUpdateCard } from '../api/boards';
import { ApiError } from '../api/client';
import { formatDateTime } from '../pages/format';
import { fromApi, fromZod, noErrors, type FormErrors } from '../pages/formErrors';
import { cardClosed } from '../store/boardUiSlice';
import { useAppDispatch } from '../store/store';
import { Field } from './Field';

interface CardDialogProps {
  boardId: string;
  // The open card as the board has it now: undefined once it is deleted
  card: CardInfo | undefined;
  columnName: string | undefined;
  // The family's members; undefined while they load or if loading failed
  members: FamilyMemberInfo[] | undefined;
}

// The card dialog: edit the title, description, assignee and due date, or delete the card.
// Which card is open lives in Redux (boardUi.openCardId); the card itself comes from the
// board in TanStack Query. The board screen renders this while a card is open, with
// key={openCardId}, so every card starts with a fresh form.
//
// Every way out (Save, Delete, Cancel, Esc, the backdrop) goes through the native
// dialog.close(). The browser then returns focus to the card tile that opened the dialog, and
// the "close" event tells Redux. A close() that comes after the dialog is gone does nothing.
export function CardDialog({ boardId, card, columnName, members }: CardDialogProps) {
  const dispatch = useAppDispatch();
  const updateCard = useUpdateCard(boardId);
  const deleteCard = useDeleteCard(boardId);
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  // The card as it was when the dialog opened. Changes are computed against this snapshot,
  // not against `card`: a background reload brings other people's edits into `card`, and
  // comparing with it would send fields the user never touched, undoing those edits
  const [initial] = useState(card);
  const [initialColumn] = useState(columnName);
  // The form starts from the snapshot too, so a reload doesn't overwrite what is typed.
  // Form controls hold strings; '' means "nobody" and "no due date"
  const [title, setTitle] = useState(card?.title ?? '');
  const [description, setDescription] = useState(card?.description ?? '');
  const [assigneeId, setAssigneeId] = useState(card?.assigneeId ?? '');
  const [dueDate, setDueDate] = useState(card?.dueDate ?? '');
  // The date field itself: the browser knows it holds a partial date (validity.badInput) even
  // though its value is '', and only the element can tell
  const dueDateInput = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState(noErrors);
  // True from pressing "Delete card" until the delete fails: the card vanishing from the
  // board is then our own doing, not "deleted by someone else"
  const [deletingHere, setDeletingHere] = useState(false);
  // A request is running. A ref, not state: the close handlers must see the current value
  // at once, without waiting for a re-render
  const busy = useRef(false);
  // Where the last mouse press started and ended (see onClick on the dialog)
  const pressedOnBackdrop = useRef(false);
  const releasedOnBackdrop = useRef(false);

  // showModal() puts the dialog in the top layer: the page behind is inert and dimmed, focus
  // moves into the dialog and Esc closes it. It is a method, not an attribute, so an effect
  // calls it. StrictMode runs effects twice; the check skips the second call
  useEffect(() => {
    if (!initial) {
      // Opened for a card that is not on the board: nothing to show
      dispatch(cardClosed());
      return;
    }
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [initial, dispatch]);

  if (!initial) return null;

  const pending = updateCard.isPending || deleteCard.isPending;
  // The card is no longer on the board. Then nothing can be saved or deleted, whoever deleted
  // it: someone else, or this user with a delete whose answer was lost (an error was shown,
  // but the reload after it found the card gone)
  const gone = card === undefined;
  const deletedElsewhere = gone && !deletingHere;
  const shown = card ?? initial;

  // Cancel, the backdrop and "nothing changed": no closing while a request runs, so its
  // result (an error especially) is never lost
  function requestClose() {
    if (!busy.current) dialog.current?.close();
  }

  function onClose() {
    // Browsers let a repeated Esc close a modal dialog even if its "cancel" event is cancelled,
    // so a dialog can never trap the user. If that happens during a request, finish() decides
    // what to do once the request ends
    if (busy.current) return;
    leave();
  }

  // The dialog is closed: tell Redux, and make sure focus is somewhere useful. close() has
  // already returned focus to the card tile, unless the tile is gone (the card was deleted,
  // or a filter hides it after the save): then focus would fall to <body>, and a keyboard
  // user would start again from the top of the page. The card's column takes it instead
  function leave() {
    dispatch(cardClosed());
    const active = document.activeElement;
    // Lost focus is <body>, nothing, or still a (now hidden) button inside the closed dialog
    if (!active || active === document.body || dialog.current?.contains(active)) {
      const columnId = (card ?? initial!).columnId;
      document.querySelector<HTMLElement>(`[data-column-id="${CSS.escape(columnId)}"]`)?.focus();
    }
  }

  // After a request: on success close the dialog; on an error show it, and open the dialog
  // again if a repeated Esc closed it meanwhile
  function finish(error: FormErrors | null) {
    busy.current = false;
    const d = dialog.current;
    if (!d) return;
    if (error) {
      setErrors(error);
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    } else {
      leave();
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy.current || gone) return;
    // A half-typed date ("11/__/2030") gives the input the value '' too, the same as an empty
    // one. Without this check it would be saved as "no due date" and remove the card's date
    if (dueDateInput.current?.validity.badInput) {
      return setErrors({
        fields: { dueDate: ['Enter a full date, or remove the due date'] },
        form: null,
      });
    }
    const parsed = updateCardSchema.safeParse({
      title,
      description,
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
    });
    if (!parsed.success) return setErrors(fromZod(parsed.error));

    // Only what the user changed (after trimming): the PATCH changes just the sent fields, so
    // fields someone else edited meanwhile keep their new values
    const changes: UpdateCardRequest = {};
    for (const key of ['title', 'description', 'assigneeId', 'dueDate'] as const) {
      if (parsed.data[key] !== initial![key]) Object.assign(changes, { [key]: parsed.data[key] });
    }
    if (Object.keys(changes).length === 0) return requestClose();

    setErrors(noErrors);
    busy.current = true;
    try {
      // Resolves once the reloaded board is in the cache (afterBoardChange)
      await updateCard.mutateAsync({ cardId: initial!.id, ...changes });
    } catch (err) {
      return finish(fromApi(err));
    }
    finish(null);
  }

  // Is the pointer outside the dialog's box, on the backdrop?
  function outsideDialog(e: { clientX: number; clientY: number }): boolean {
    const box = dialog.current?.getBoundingClientRect();
    if (!box) return false;
    return (
      e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom
    );
  }

  function removeDueDate() {
    setDueDate('');
    // A partial date is not in React's value (that is '' already), so React would not touch
    // the field: clear it directly
    if (dueDateInput.current) dueDateInput.current.value = '';
    setErrors((prev) => ({ ...prev, fields: { ...prev.fields, dueDate: undefined } }));
    // This button may disappear now (no date left, no error), and it has focus: the date field
    // takes it, instead of focus falling to <body> inside the dialog
    dueDateInput.current?.focus();
  }

  async function onDelete() {
    if (busy.current || !window.confirm(`Delete the card "${shown.title}"?`)) return;
    setErrors(noErrors);
    setDeletingHere(true);
    busy.current = true;
    try {
      await deleteCard.mutateAsync(initial!.id);
    } catch (err) {
      // 404: someone has already deleted it, which is what the user wanted
      if (!(err instanceof ApiError && err.status === 404)) {
        finish(fromApi(err));
        return checkStillThere();
      }
    }
    finish(null);
  }

  // After a failed delete: did it really fail? The server may have deleted the card and only
  // the answer was lost. Until the board is reloaded deletingHere stays true, so a card that
  // vanishes is not blamed on "someone else". If the reload still has the card, the delete did
  // fail, and a later disappearance is someone else's doing again. The cache is read directly:
  // with structural sharing an unchanged card keeps the same object, so nothing re-renders
  async function checkStillThere() {
    const key = boardQuery(boardId).queryKey;
    await queryClient.refetchQueries({ queryKey: key });
    const board = queryClient.getQueryData(key);
    const there = board?.columns.some((c) => c.cards.some((x) => x.id === initial!.id));
    if (there) setDeletingHere(false);
  }

  // A former member, or the members are not loaded: keep the current assignee selectable,
  // so saving another field doesn't silently clear it
  const assigneeKnown =
    !initial.assigneeId || members?.some((m) => m.userId === initial.assigneeId);

  // The same wiring as Field.tsx for the controls Field doesn't cover (textarea, select, date):
  // aria-describedby links a control to its error text, so a screen reader reads the error
  // out, not just "invalid"
  type Checked = 'description' | 'assigneeId' | 'dueDate';
  const errorId = (field: Checked) => `${headingId}-${field}-error`;
  const invalidProps = (field: Checked) => {
    const invalid = Boolean(errors.fields[field]?.length);
    return { 'aria-invalid': invalid, 'aria-describedby': invalid ? errorId(field) : undefined };
  };
  const errorText = (field: Checked) =>
    errors.fields[field] && (
      <span id={errorId(field)} className="error">
        {errors.fields[field].join('. ')}
      </span>
    );

  return (
    <dialog
      ref={dialog}
      className="card-dialog"
      aria-labelledby={headingId}
      onCancel={(e) => {
        if (busy.current) e.preventDefault();
      }}
      onClose={onClose}
      // A click on the dimmed backdrop closes the dialog. The event's target can't tell: a click
      // on the backdrop lands on the <dialog> element, but so do a drag between a field and the
      // backdrop (selecting text) and a click on the dialog's own scrollbar (a tall dialog on a
      // small screen). Each would close it and lose the edits. So the test is geometric: both
      // the press and the release must be outside the dialog's box
      onPointerDown={(e) => {
        pressedOnBackdrop.current = outsideDialog(e);
      }}
      onPointerUp={(e) => {
        releasedOnBackdrop.current = outsideDialog(e);
      }}
      onClick={() => {
        const onBackdrop = pressedOnBackdrop.current && releasedOnBackdrop.current;
        pressedOnBackdrop.current = releasedOnBackdrop.current = false;
        if (onBackdrop) requestClose();
      }}
    >
      <form className="card-dialog-body stack" onSubmit={onSubmit} noValidate>
        <div className="stack-tight">
          <h2 id={headingId}>Card</h2>
          <p className="muted small">
            In {columnName ?? initialColumn} · created {formatDateTime(shown.createdAt)}
          </p>
        </div>

        {gone && (
          <p className="error" role="alert">
            {deletedElsewhere
              ? "This card was deleted by someone else. Your changes can't be saved."
              : 'This card has been deleted.'}
          </p>
        )}

        <Field
          label="Title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          errors={errors.fields.title}
        />

        <label className="field">
          <span>Description</span>
          <textarea
            name="description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            {...invalidProps('description')}
          />
          {errorText('description')}
        </label>

        <div className="fields-row">
          <label className="field">
            <span>Assignee</span>
            <select
              name="assigneeId"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              {...invalidProps('assigneeId')}
            >
              <option value="">Nobody</option>
              {members?.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
              {!assigneeKnown && <option value={initial.assigneeId!}>Assigned (unknown)</option>}
            </select>
            {errorText('assigneeId')}
          </label>

          <label className="field">
            <span>Due date</span>
            {/* The value of a date input is "YYYY-MM-DD" (or '' when empty): the API's format,
                with no time zone involved. The browser shows it in the user's locale */}
            <input
              ref={dueDateInput}
              type="date"
              name="dueDate"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              {...invalidProps('dueDate')}
            />
            {errorText('dueDate')}
          </label>
        </div>
        {/* Also when the field holds a partial date (its value is '' then): the card had a
            date, or the partial-date error is shown, and that message points to this button */}
        {(dueDate || initial.dueDate || errors.fields.dueDate) && (
          <button type="button" className="link small" onClick={removeDueDate}>
            Remove the due date
          </button>
        )}

        {/* Once the card is gone, the notice above says what matters; the request's error (a
            404, or the lost answer of the user's own delete) would only add noise */}
        {errors.form && !gone && (
          <p className="error" role="alert">
            {errors.form}
          </p>
        )}

        <div className="dialog-actions">
          <button
            type="button"
            className="link danger"
            onClick={() => void onDelete()}
            disabled={pending || gone}
          >
            Delete card
          </button>
          <span className="row-actions">
            <button type="button" className="link" onClick={requestClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" disabled={pending || gone}>
              {updateCard.isPending ? 'Saving…' : 'Save'}
            </button>
          </span>
        </div>
      </form>
    </dialog>
  );
}
