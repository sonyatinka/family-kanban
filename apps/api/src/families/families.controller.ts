import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  createFamilySchema,
  type CreateFamilyRequest,
  type FamilyDetails,
  type FamilySummary,
} from '@family/shared';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { uuidParam } from '../common/uuid-param';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FamiliesService } from './families.service';

// Every route needs an access token: there is no @Public() here, the global guard applies.
// familyId is always explicit in the URL, so the API is ready for several families per person
@Controller('families')
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

  // POST /api/families → 201, the new family; the creator is a parent
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createFamilySchema)) body: CreateFamilyRequest,
  ): Promise<FamilyDetails> {
    return this.families.create(user.id, body);
  }

  // GET /api/families → my families (an array, of 0 or 1 items for now)
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<FamilySummary[]> {
    return this.families.listForUser(user.id);
  }

  // GET /api/families/:familyId → the family with its members, if I am a member
  @Get(':familyId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('familyId', uuidParam('Invalid family id')) familyId: string,
  ): Promise<FamilyDetails> {
    return this.families.getForMember(familyId, user.id);
  }
}
