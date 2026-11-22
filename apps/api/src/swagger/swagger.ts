import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
  type OperationObject,
} from '@nestjs/swagger';
import { PUBLIC_EXTENSION } from '../auth/auth.decorators';
import { componentSchemas, errorResponse } from './openapi-schemas';

const BEARER = 'bearer';
// The operation keys of an OpenAPI path item (the rest, such as parameters, are not operations)
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

// Swagger UI at /api/docs, the OpenAPI document at /api/docs-json. Development only (main.ts):
// a map of every endpoint is for developers, not for everyone on the internet
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Family Kanban API')
    .setDescription(
      'Log in with POST /api/auth/login, copy accessToken from the answer, press Authorize ' +
        'and paste it. The token lives 15 minutes; POST /api/auth/refresh gives a new one.\n\n' +
        '**Careful:** cookies ignore the port, so this page shares the refresh_token cookie ' +
        'with the web app on localhost:5173. Logging in, refreshing or logging out here ' +
        'replaces or ends the session of the web app open in the same browser.',
    )
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, BEARER)
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    // BoardsController_get → Boards_get
    operationIdFactory: (controller, method) =>
      `${controller.replace(/Controller$/, '')}_${method}`,
  });
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...componentSchemas() },
  };
  for (const operation of operations(document)) {
    markProtected(operation);
    narrowBadRequest(operation);
  }

  // No persistAuthorization: it would keep the token in localStorage, and through the Vite
  // proxy (localhost:5173/api/docs) that is the web app's own origin. Paste it again on reload
  SwaggerModule.setup('api/docs', app, document);
}

type Operation = OperationObject & Record<string, unknown>;

// Every operation of the document, whatever its HTTP method (@All() also gives options, head…)
function* operations(document: OpenAPIObject): Generator<Operation> {
  for (const pathItem of Object.values(document.paths)) {
    for (const [key, value] of Object.entries(pathItem)) {
      if (HTTP_METHODS.has(key) && value) yield value as Operation;
    }
  }
}

// The same rule as the global JwtAuthGuard: every route needs a token unless it is @Public().
// @Public() leaves an x-public mark on the operation; the rest get the lock and a 401
function markProtected(operation: Operation): void {
  if (operation[PUBLIC_EXTENSION]) {
    delete operation[PUBLIC_EXTENSION];
    return;
  }
  operation.security = [{ [BEARER]: [] }];
  operation.responses['401'] ??= {
    description: 'No access token, or it is invalid or expired: refresh the session',
    content: { 'application/json': { schema: errorResponse() } },
  };
}

// @ApiDoc gives every 400 both shapes. A route without a body has no body validation, so its
// 400 can only be the plain one (an id in the URL that is not a UUID)
function narrowBadRequest(operation: Operation): void {
  const badRequest = operation.responses['400'];
  if (operation.requestBody || !badRequest || !('description' in badRequest)) return;
  badRequest.content = { 'application/json': { schema: errorResponse() } };
}
