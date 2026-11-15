import { registerSchema } from '@family/shared';
import { Link, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { register } from '../api/client';
import { Field } from '../components/Field';
import { fromApi, fromZod, noErrors } from './formErrors';

export function RegisterPage() {
  const search = useSearch({ from: '/guest' });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState(noErrors);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = registerSchema.safeParse({ name, email, password });
    if (!parsed.success) return setErrors(fromZod(parsed.error));

    setErrors(noErrors);
    setPending(true);
    try {
      // The API logs the new user in right away, so the router redirects as after a login
      await register(parsed.data);
    } catch (err) {
      setErrors(fromApi(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate>
      <h1>Sign up</h1>
      <Field
        label="Name"
        name="name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        errors={errors.fields.name}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        errors={errors.fields.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        errors={errors.fields.password}
      />
      {errors.form && (
        <p className="error" role="alert">
          {errors.form}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Creating your account…' : 'Sign up'}
      </button>
      <p className="muted">
        Already have an account?{' '}
        <Link to="/login" search={search}>
          Log in
        </Link>
      </p>
    </form>
  );
}
