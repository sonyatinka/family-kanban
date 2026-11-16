import { createFamilySchema } from '@family/shared';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useCreateFamily } from '../api/families';
import { fromApi, fromZod, noErrors } from '../pages/formErrors';
import { Field } from './Field';

export function CreateFamilyForm() {
  const navigate = useNavigate();
  const createFamily = useCreateFamily();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState(noErrors);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = createFamilySchema.safeParse({ name });
    if (!parsed.success) return setErrors(fromZod(parsed.error));

    setErrors(noErrors);
    let family;
    try {
      // mutateAsync, not mutate(data, { onSuccess }): HomePage removes this form as soon as
      // the reloaded list has a family in it. TanStack Query skips callbacks passed to
      // mutate() for an unmounted component; a promise resolves either way.
      family = await createFamily.mutateAsync(parsed.data);
    } catch (err) {
      return setErrors(fromApi(err));
    }
    // Outside the try: a navigation problem must not be reported as a failed creation
    void navigate({ to: '/families/$familyId', params: { familyId: family.id } });
  }

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate>
      <h2>Create your family</h2>
      <p className="muted">You will be a parent in it and can invite the others later.</p>
      <Field
        label="Family name"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        errors={errors.fields.name}
      />
      {errors.form && (
        <p className="error" role="alert">
          {errors.form}
        </p>
      )}
      <button type="submit" disabled={createFamily.isPending}>
        {createFamily.isPending ? 'Creating…' : 'Create family'}
      </button>
    </form>
  );
}
