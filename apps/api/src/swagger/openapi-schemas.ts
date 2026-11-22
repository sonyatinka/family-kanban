import type { ReferenceObject, SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import {
  authResponseSchema,
  boardDetailsSchema,
  boardSummarySchema,
  cardInfoSchema,
  columnInfoSchema,
  columnSummarySchema,
  createdInviteSchema,
  familyDetailsSchema,
  familyMemberInfoSchema,
  familySummarySchema,
  healthResponseSchema,
  invitePreviewSchema,
  inviteSummarySchema,
  publicUserSchema,
  validationErrorResponseSchema,
} from '@family/shared';

// Zod schemas → OpenAPI schemas for the Swagger docs, with z.toJSONSchema. There are no DTO
// classes: the same schemas validate requests and describe them, so the docs can't drift.

// Nest's own error body, for example new NotFoundException('Board not found') →
// { "statusCode": 404, "message": "Board not found", "error": "Not Found" }
const errorResponseSchema = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  error: z.string(),
});

// Response schemas get a name and go to components.schemas once; operations refer to them with
// $ref, and so do schemas nested in each other (BoardDetails → ColumnInfo → CardInfo).
// The names live here, not in @family/shared, so the shared package has no docs concerns
const named = z.registry<{ id: string }>();
const NAMES: Record<string, z.ZodType> = {
  PublicUser: publicUserSchema,
  AuthResponse: authResponseSchema,
  FamilySummary: familySummarySchema,
  FamilyMemberInfo: familyMemberInfoSchema,
  FamilyDetails: familyDetailsSchema,
  CreatedInvite: createdInviteSchema,
  InviteSummary: inviteSummarySchema,
  InvitePreview: invitePreviewSchema,
  BoardSummary: boardSummarySchema,
  BoardDetails: boardDetailsSchema,
  ColumnSummary: columnSummarySchema,
  ColumnInfo: columnInfoSchema,
  CardInfo: cardInfoSchema,
  HealthResponse: healthResponseSchema,
  ValidationErrorResponse: validationErrorResponseSchema,
  ErrorResponse: errorResponseSchema,
};
for (const [id, schema] of Object.entries(NAMES)) named.add(schema, { id });

const COMPONENTS = '#/components/schemas/';

// All named schemas, for components.schemas of the document
export function componentSchemas(): Record<string, SchemaObject> {
  const { schemas } = z.toJSONSchema(named, {
    target: 'openapi-3.0',
    uri: (id) => COMPONENTS + id,
  });
  const result: Record<string, SchemaObject> = {};
  for (const [id, schema] of Object.entries(schemas)) result[id] = tidy(schema) as SchemaObject;
  return result;
}

// A request body. io: 'input' describes what the client sends: a field with a default
// (description: '' on a new card) is optional for the client, though always set after parsing
export function requestBodySchema(schema: z.ZodType): SchemaObject {
  return tidy(z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' })) as SchemaObject;
}

// A response body: a named schema, or an array of one (z.array(boardSummarySchema))
export function responseSchema(schema: z.ZodType): SchemaObject | ReferenceObject {
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: ref(schema.element as z.ZodType) };
  }
  return ref(schema);
}

export function ref(schema: z.ZodType): ReferenceObject {
  const id = named.get(schema)?.id;
  // Fails at startup, so a forgotten name can't produce a silently broken document
  if (!id) throw new Error('Response schema has no name: add it to NAMES in openapi-schemas.ts');
  return { $ref: COMPONENTS + id };
}

export const errorResponse = (): ReferenceObject => ref(errorResponseSchema);
export const validationErrorResponse = (): ReferenceObject => ref(validationErrorResponseSchema);

// Removes what OpenAPI 3.0 doesn't have or what only clutters the page: $id and $schema,
// and the long regex Zod writes next to a format (uuid, date, date-time, email) — the format
// already says it. Lengths and enums stay.
// The keys of a `properties` map are field names, not schema keywords: a field called
// "pattern" must survive, so that map is walked without dropping anything
function tidy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tidy);
  if (node === null || typeof node !== 'object') return node;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$id' || key === '$schema') continue;
    if (key === 'pattern' && 'format' in node) continue;
    result[key] = key === 'properties' ? tidyEach(value) : tidy(value);
  }
  return result;
}

// { fieldName: schema, … } → each schema tidied, every field name kept
function tidyEach(properties: unknown): unknown {
  if (properties === null || typeof properties !== 'object') return properties;
  return Object.fromEntries(Object.entries(properties).map(([name, s]) => [name, tidy(s)]));
}
