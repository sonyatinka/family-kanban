import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { z } from 'zod';
import { errorResponse, responseSchema, validationErrorResponse } from './openapi-schemas';

type ErrorStatus = 400 | 401 | 403 | 404 | 409;

interface ApiDocOptions {
  summary: string;
  description?: string;
  // The success status, as the route really answers (POST is 201 unless @HttpCode says otherwise)
  status: 200 | 201 | 204;
  // The response body: a named schema or z.array(namedSchema). None for 204
  returns?: z.ZodType;
  // When the route answers with an error, in words. 401 for a missing or expired access token is
  // added to every protected route by setupSwagger, so list 401 only for public routes
  errors?: Partial<Record<ErrorStatus, string>>;
}

const SUCCESS = { 200: 'OK', 201: 'Created', 204: 'No content' } as const;

// Describes one route in the Swagger docs:
// @ApiDoc({ summary: 'Get a board', status: 200, returns: boardDetailsSchema, errors: { 404: '…' } })
export function ApiDoc(options: ApiDocOptions): MethodDecorator {
  const decorators = [
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiResponse({
      status: options.status,
      description: SUCCESS[options.status],
      ...(options.returns && { schema: responseSchema(options.returns) }),
    }),
  ];
  for (const [status, description] of Object.entries(options.errors ?? {})) {
    decorators.push(
      ApiResponse({
        status: Number(status),
        description,
        // A 400 is either a body validation error (errors by field) or a plain one,
        // such as an id in the URL that is not a UUID
        schema:
          status === '400'
            ? { oneOf: [validationErrorResponse(), errorResponse()] }
            : errorResponse(),
      }),
    );
  }
  return applyDecorators(...decorators);
}
