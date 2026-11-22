import { Body } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import type { z } from 'zod';
import { requestBodySchema } from '../swagger/openapi-schemas';
import { ZodValidationPipe } from './zod-validation.pipe';

// @ZodBody(schema) body: T — validates the body with the Zod schema (ZodValidationPipe) and
// describes it in the Swagger docs from the same schema. The schema is named once, so the docs
// always show what the validation really accepts.
export function ZodBody(schema: z.ZodType): ParameterDecorator {
  return (target, key, index) => {
    // Check first, so a misuse fails at once instead of validating without docs
    if (key === undefined) throw new Error('@ZodBody() is for method parameters');
    // ApiBody is a method decorator: apply it to the method this parameter belongs to
    const method = Object.getOwnPropertyDescriptor(target, key);
    if (!method) throw new Error(`@ZodBody(): method ${String(key)} not found on the class`);
    Body(new ZodValidationPipe(schema))(target, key, index);
    ApiBody({ schema: requestBodySchema(schema) })(target, key, method);
  };
}
