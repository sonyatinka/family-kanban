import type { InputHTMLAttributes, Ref } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  errors?: string[];
  // React 19 passes ref to a function component as a plain prop; it goes on to the <input>
  ref?: Ref<HTMLInputElement>;
}

// A labeled input with its validation errors. The error text is linked to the input with
// aria-describedby, so screen readers read it out
export function Field({ label, name, errors, ...input }: FieldProps) {
  const errorId = `${name}-error`;
  const invalid = Boolean(errors?.length);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        {...input}
      />
      {invalid && (
        <span id={errorId} className="error">
          {errors!.join('. ')}
        </span>
      )}
    </label>
  );
}
