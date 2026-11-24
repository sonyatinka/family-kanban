import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { z } from 'zod';
import { fromApi, fromZod, noErrors } from '../pages/formErrors';
import { Field } from './Field';

interface EditableNameProps {
  // The name as it is now, and how it looks when not being edited (a heading, for example)
  value: string;
  children: ReactNode;
  // The input's label, such as "Board name", and the Rename button's accessible name
  label: string;
  renameLabel: string;
  // The shared Zod schema of the rename body: the same rules as the API
  schema: z.ZodType<{ name: string }>;
  save: (name: string) => Promise<unknown>;
}

// A name with a Rename button that turns into a small form. Used for boards and columns
export function EditableName({
  value,
  children,
  label,
  renameLabel,
  schema,
  save,
}: EditableNameProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(value);
  const [errors, setErrors] = useState(noErrors);
  const [saving, setSaving] = useState(false);
  const fieldId = useId();
  // Closing the form removes the focused input. Focus goes back to the Rename button, so a
  // keyboard user doesn't land on <body> and start again from the top of the page
  const renameButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      renameButton.current?.focus();
    }
  }, [editing]);

  function stopEditing() {
    returnFocus.current = true;
    setEditing(false);
  }

  function start() {
    // Start from the current name: it may have changed since the last edit
    setName(value);
    setErrors(noErrors);
    setEditing(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ name });
    if (!parsed.success) return setErrors(fromZod(parsed.error));
    // Nothing changed: no request
    if (parsed.data.name === value) return stopEditing();

    setSaving(true);
    try {
      await save(parsed.data.name);
      stopEditing();
    } catch (err) {
      setErrors(fromApi(err));
    } finally {
      setSaving(false);
    }
  }

  // Not while saving: a failed save would put its error into a hidden form, and the user would
  // never learn that the name was not changed
  function cancel() {
    if (!saving) stopEditing();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') cancel();
  }

  if (!editing) {
    return (
      <div className="name-row">
        {children}
        <button
          ref={renameButton}
          type="button"
          className="link small"
          aria-label={renameLabel}
          onClick={start}
        >
          Rename
        </button>
      </div>
    );
  }

  return (
    <form className="stack-tight" onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate>
      <Field
        label={label}
        // Unique per editor: the error text's id is built from it, and a board and a column
        // can be renamed at the same time
        name={`name${fieldId}`}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        errors={errors.fields.name}
      />
      {errors.form && (
        <p className="error small" role="alert">
          {errors.form}
        </p>
      )}
      <div className="row-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="link" onClick={cancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
