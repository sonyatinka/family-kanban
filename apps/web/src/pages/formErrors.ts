import type { ValidationErrorResponse } from '@family/shared';
import { z } from 'zod';
import { ApiError } from '../api/client';

export type FieldErrors = ValidationErrorResponse['errors'];

export interface FormErrors {
  fields: FieldErrors;
  form: string | null;
}

export const noErrors: FormErrors = { fields: {}, form: null };

// Validation errors from the shared Zod schema, the same rules the API applies
export function fromZod(error: z.ZodError): FormErrors {
  return { fields: z.flattenError(error).fieldErrors, form: null };
}

// An error from the API: field errors for a 400, the message for everything else
export function fromApi(err: unknown): FormErrors {
  if (err instanceof ApiError) {
    const hasFields = Object.keys(err.fieldErrors).length > 0;
    return { fields: err.fieldErrors, form: hasFields ? null : err.message };
  }
  return { fields: {}, form: 'Cannot reach the server. Check your connection and try again.' };
}
