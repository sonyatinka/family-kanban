import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createdInviteSchema,
  createInviteSchema,
  familyDetailsSchema,
  invitePreviewSchema,
  inviteSummarySchema,
  type CreatedInvite,
  type CreateInviteRequest,
  type FamilyDetails,
  type InvitePreview,
  type InviteSummary,
} from '@family/shared';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { uuidParam } from '../common/uuid-param';
import { ZodBody } from '../common/zod-body.decorator';
import { ApiDoc } from '../swagger/api-doc.decorator';
import { InvitesService } from './invites.service';

// Managing a family's invites: parents only (checked in the service)
@ApiTags('invites')
@Controller('families/:familyId/invites')
export class FamilyInvitesController {
  constructor(private readonly invites: InvitesService) {}

  // POST /api/families/:familyId/invites → 201, the invite with its token (shown only once)
  @Post()
  @ApiDoc({
    summary: 'Create an invite link (parents only)',
    description: 'The token is in this answer only: the database keeps just its hash.',
    status: 201,
    returns: createdInviteSchema,
    errors: {
      400: 'Invalid family id, role or lifetime',
      403: 'I am not a parent of this family',
      404: 'No such family, or I am not a member',
    },
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param('familyId', uuidParam('Invalid family id')) familyId: string,
    @ZodBody(createInviteSchema) body: CreateInviteRequest,
  ): Promise<CreatedInvite> {
    return this.invites.create(familyId, user.id, body);
  }

  // GET /api/families/:familyId/invites → the invites that still work
  @Get()
  @ApiDoc({
    summary: 'Invites that still work (parents only)',
    status: 200,
    returns: z.array(inviteSummarySchema),
    errors: {
      400: 'Invalid family id',
      403: 'I am not a parent of this family',
      404: 'No such family, or I am not a member',
    },
  })
  list(
    @CurrentUser() user: AuthUser,
    @Param('familyId', uuidParam('Invalid family id')) familyId: string,
  ): Promise<InviteSummary[]> {
    return this.invites.list(familyId, user.id);
  }

  // DELETE /api/families/:familyId/invites/:inviteId → 204, the link stops working
  @Delete(':inviteId')
  @HttpCode(204)
  @ApiDoc({
    summary: 'Revoke an invite (parents only)',
    status: 204,
    errors: {
      400: 'Invalid family or invite id',
      403: 'I am not a parent of this family',
      404: 'No such family or working invite',
    },
  })
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('familyId', uuidParam('Invalid family id')) familyId: string,
    @Param('inviteId', uuidParam('Invalid invite id')) inviteId: string,
  ): Promise<void> {
    return this.invites.revoke(familyId, inviteId, user.id);
  }
}

// Using an invite link. The person must be logged in: the web app sends a guest to the login
// page first and brings them back to the link afterwards
@ApiTags('invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  // GET /api/invites/:token → which family, who invites, which role, am I already in it
  @Get(':token')
  @ApiDoc({
    summary: 'What the invite is for, before joining',
    status: 200,
    returns: invitePreviewSchema,
    errors: { 404: 'The link does not work: unknown, used, revoked or expired' },
  })
  preview(@CurrentUser() user: AuthUser, @Param('token') token: string): Promise<InvitePreview> {
    return this.invites.preview(token, user.id);
  }

  // POST /api/invites/:token/accept → 200, the family the user has joined
  @Post(':token/accept')
  @HttpCode(200)
  @ApiDoc({
    summary: 'Join the family with the invite',
    status: 200,
    returns: familyDetailsSchema,
    errors: {
      404: 'The link does not work: unknown, used, revoked or expired',
      409: 'I am already in this family (the invite stays unused)',
    },
  })
  accept(@CurrentUser() user: AuthUser, @Param('token') token: string): Promise<FamilyDetails> {
    return this.invites.accept(token, user.id);
  }
}
