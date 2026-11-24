import { boardNameSchema } from '@family/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { boardsQuery, useCreateBoard } from '../api/boards';
import { fromApi, fromZod, noErrors } from '../pages/formErrors';
import { Field } from './Field';

// The family's boards on the family page, with a form for a new one.
// Any member may create a board (roles come in stage 3)
export function FamilyBoards({ familyId }: { familyId: string }) {
  const navigate = useNavigate();
  const boards = useQuery(boardsQuery(familyId));
  const createBoard = useCreateBoard(familyId);
  const [name, setName] = useState('');
  const [errors, setErrors] = useState(noErrors);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = boardNameSchema.safeParse({ name });
    if (!parsed.success) return setErrors(fromZod(parsed.error));

    setErrors(noErrors);
    let board;
    try {
      board = await createBoard.mutateAsync(parsed.data);
    } catch (err) {
      return setErrors(fromApi(err));
    }
    void navigate({ to: '/boards/$boardId', params: { boardId: board.id } });
  }

  return (
    <section className="card stack">
      <h2>Boards</h2>

      {boards.isPending && <p className="muted">Loading boards…</p>}
      {boards.isError && !boards.data && <p className="error">Could not load the boards.</p>}
      {boards.data?.length === 0 && <p className="muted small">No boards yet.</p>}
      {boards.data && boards.data.length > 0 && (
        <ul className="list">
          {boards.data.map((board) => (
            <li key={board.id} className="row">
              <Link to="/boards/$boardId" params={{ boardId: board.id }}>
                {board.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form className="stack" onSubmit={onSubmit} noValidate>
        <Field
          label="New board"
          name="boardName"
          placeholder="Chores, Shopping, Holidays…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          errors={errors.fields.name}
        />
        {errors.form && (
          <p className="error" role="alert">
            {errors.form}
          </p>
        )}
        <button type="submit" disabled={createBoard.isPending}>
          {createBoard.isPending ? 'Creating…' : 'Create board'}
        </button>
      </form>
    </section>
  );
}
