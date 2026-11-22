import { z } from 'zod';

// Schemas are the shared contract: the API validates request bodies with them, the web app
// (step 6) validates forms. The type is inferred from the schema (z.infer), so the check
// and the type can't drift apart.

// Normalize the email before checking it: ' Anna@Mail.ru ' and 'anna@mail.ru' are one user
const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email'));

// The upper limit is a sane bound for a form, not an argon2 requirement: argon2 first
// compresses the password with Blake2b, so length barely affects the cost. (bcrypt is
// different: it silently drops everything after 72 bytes.) Express also rejects bodies over 100 KB
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const registerSchema = z.object({
  email,
  password,
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Name must be at most 100 characters'),
});

// No minimum length on login: the rules may have changed since the user signed up
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128, 'Password is too long'),
});

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;

// Response schemas describe what the API sends back. The types are inferred from them, and the
// API builds its Swagger docs from them. Nothing parses responses with them yet (API tests will)

// A user in API responses: no password hash
export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});

export type PublicUser = z.infer<typeof publicUserSchema>;

// Response of register, login and refresh. The web app keeps the access token in memory and
// sends it as Authorization: Bearer <token>. The refresh token is not in the body: it is in
// an httpOnly cookie that page JavaScript can't read.
export const authResponseSchema = z.object({
  accessToken: z.string().describe('JWT, valid for 15 minutes. Send it as Authorization: Bearer'),
  user: publicUserSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

// Body of a 400 response on a validation error
export const validationErrorResponseSchema = z.object({
  statusCode: z.literal(400),
  message: z.string(),
  errors: z
    .record(z.string(), z.array(z.string()).optional())
    .describe('Error messages by field name'),
});

export type ValidationErrorResponse = z.infer<typeof validationErrorResponseSchema>;
