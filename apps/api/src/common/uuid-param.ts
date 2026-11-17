import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

// For ids in the URL: not a UUID → 400 at once, without a database query (Postgres would
// fail on the type cast). Usage: @Param('familyId', uuidParam('Invalid family id'))
export function uuidParam(message: string): ParseUUIDPipe {
  return new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException(message) });
}
