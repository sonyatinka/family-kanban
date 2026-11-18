import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  createInviteSchema,
  type CreatedInvite,
  type CreateInviteRequest,
  type FamilyDetails,
  type InvitePreview,
  type InviteSummary,
} from '@family/shared';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { uuidParam } from '../common/uuid-param';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InvitesService } from './invites.service';

// Managing a family's invites: parents only (checked in the service)
@Controller('families/:familyId/invites')
export class FamilyInvitesController {
  constructor(private readonly invites: InvitesService) {}

  // POST /api/families/:familyId/invites → 201, the invite with its token (shown only once)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('familyId', uuidParam('Invalid family id')) familyId: string,
    @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteRequest,
  ): Promise<CreatedInvite> {
    return this.invites.create(familyId, user.id, body);
  }

  // GET /api/families/:familyId/invites → the invites that still work
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('familyId', uuidParam('Invalid family id')) familyId: string,
  ): Promise<InviteSummary[]> {
    return this.invites.list(familyId, user.id);
  }

  // DELETE /api/families/:familyId/invites/:inviteId → 204, the link stops working
  @Delete(':inviteId')
  @HttpCode(204)
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
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  // GET /api/invites/:token → which family, who invites, which role, am I already in it
  @Get(':token')
  preview(@CurrentUser() user: AuthUser, @Param('token') token: string): Promise<InvitePreview> {
    return this.invites.preview(token, user.id);
  }

  // POST /api/invites/:token/accept → 200, the family the user has joined
  @Post(':token/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('token') token: string): Promise<FamilyDetails> {
    return this.invites.accept(token, user.id);
  }
}
