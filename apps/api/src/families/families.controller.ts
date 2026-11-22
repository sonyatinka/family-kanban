import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createFamilySchema,
  familyDetailsSchema,
  familySummarySchema,
  type CreateFamilyRequest,
  type FamilyDetails,
  type FamilySummary,
} from '@family/shared';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { uuidParam } from '../common/uuid-param';
import { ZodBody } from '../common/zod-body.decorator';
import { ApiDoc } from '../swagger/api-doc.decorator';
import { FamiliesService } from './families.service';

// Every route needs an access token: there is no @Public() here, the global guard applies.
// familyId is always explicit in the URL, so the API is ready for several families per person
@ApiTags('families')
@Controller('families')
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

  // POST /api/families → 201, the new family; the creator is a parent
  @Post()
  @ApiDoc({
    summary: 'Create a family; I become its parent',
    status: 201,
    returns: familyDetailsSchema,
    errors: { 400: 'Invalid family name' },
  })
  create(
    @CurrentUser() user: AuthUser,
    @ZodBody(createFamilySchema) body: CreateFamilyRequest,
  ): Promise<FamilyDetails> {
    return this.families.create(user.id, body);
  }

  // GET /api/families → my families
  @Get()
  @ApiDoc({
    summary: 'My families, with my role in each',
    status: 200,
    returns: z.array(familySummarySchema),
  })
  list(@CurrentUser() user: AuthUser): Promise<FamilySummary[]> {
    return this.families.listForUser(user.id);
  }

  // GET /api/families/:familyId → the family with its members, if I am a member
  @Get(':familyId')
  @ApiDoc({
    summary: 'A family with its members',
    status: 200,
    returns: familyDetailsSchema,
    errors: { 400: 'Invalid family id', 404: 'No such family, or I am not a member' },
  })
  get(
    @CurrentUser() user: AuthUser,
    @Param('familyId', uuidParam('Invalid family id')) familyId: string,
  ): Promise<FamilyDetails> {
    return this.families.getForMember(familyId, user.id);
  }
}
