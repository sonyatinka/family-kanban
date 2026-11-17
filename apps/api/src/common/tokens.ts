import { createHash, randomBytes } from 'node:crypto';

// A secret for a cookie or a link: 256 bits of randomness, URL-safe (43 characters).
// Used for refresh tokens and invite links.
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

// Such tokens are stored only as a hash. 256 bits of randomness can't be guessed, so a fast
// unsalted SHA-256 is enough. Passwords need argon2 because there are few of them and they
// can be brute-forced from a dictionary.
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
