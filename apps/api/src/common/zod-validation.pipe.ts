import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import type { ValidationErrorResponse } from '@family/shared';

// A pipe is a Nest step between the request and the controller method. This one validates the
// body with a Zod schema: the controller gets validated, normalized data (a lowercased email and
// so on), and on failure the client gets a 400 with errors by field.
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const body: ValidationErrorResponse = {
      statusCode: 400,
      message: 'Validation failed',
      errors: z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>,
    };
    throw new BadRequestException(body);
  }
}
