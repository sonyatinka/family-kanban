import { loginSchema } from '@family/shared';
import { Link, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { login } from '../api/client';
import { Field } from '../components/Field';
import { fromApi, fromZod, noErrors } from './formErrors';

export function LoginPage() {
  // Keep ?redirect= when switching to the sign-up page
  const search = useSearch({ from: '/guest' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState(noErrors);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Check the form with the shared schema first: no request for an obviously invalid form
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) return setErrors(fromZod(parsed.error));

    setErrors(noErrors);
    setPending(true);
    try {
      // On success the session changes and the router redirects; nothing else to do here
      await login(parsed.data);
    } catch (err) {
      setErrors(fromApi(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate>
      <h1>Log in</h1>
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
        autoComplete="current-password"
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
        {pending ? 'Logging in…' : 'Log in'}
      </button>
      <p className="muted">
        No account yet?{' '}
        <Link to="/register" search={search}>
          Sign up
        </Link>
      </p>
    </form>
  );
}
