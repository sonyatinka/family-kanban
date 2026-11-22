import { Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  boardDetailsSchema,
  boardNameSchema,
  boardSummarySchema,
  type BoardDetails,
  type BoardNameRequest,
  type BoardSummary,
} from '@family/shared';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { uuidParam } from '../common/uuid-param';
import { ZodBody } from '../common/zod-body.decorator';
import { ApiDoc } from '../swagger/api-doc.decorator';
import { BoardsService } from './boards.service';

// A family's boards. Membership is checked in the service: non-members get 404
@ApiTags('boards')
@Controller('families/:familyId/boards')
export class FamilyBoardsController {
  constructor(private readonly boards: BoardsService) {}

  // POST /api/families/:familyId/boards → 201, the new board with its default columns
  @Post()
  @ApiDoc({
    summary: 'Create a board with the columns To do, In progress, Done',
    status: 201,
    returns: boardDetailsSchema,
    errors: { 400: 'Invalid family id or board name', 404: 'No such family, or I am not a member' },
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param('familyId', uuidParam('Invalid family id')) familyId: string,
    @ZodBody(boardNameSchema) body: BoardNameRequest,
  ): Promise<BoardDetails> {
    return this.boards.create(familyId, user.id, body);
  }

  // GET /api/families/:familyId/boards → the family's boards, oldest first
  @Get()
  @ApiDoc({
    summary: "The family's boards, oldest first",
    status: 200,
    returns: z.array(boardSummarySchema),
    errors: { 400: 'Invalid family id', 404: 'No such family, or I am not a member' },
  })
  list(
    @CurrentUser() user: AuthUser,
    @Param('familyId', uuidParam('Invalid family id')) familyId: string,
  ): Promise<BoardSummary[]> {
    return this.boards.list(familyId, user.id);
  }
}

// One board. The URL has no family id: nesting every level (/families/…/boards/…/columns/…)
// makes long URLs. The service finds the board's family and checks that the caller is in it
@ApiTags('boards')
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  // GET /api/boards/:boardId → the board with its columns and cards
  @Get(':boardId')
  @ApiDoc({
    summary: 'A board with its columns and cards',
    status: 200,
    returns: boardDetailsSchema,
    errors: { 400: 'Invalid board id', 404: 'No such board, or I am not in its family' },
  })
  get(
    @CurrentUser() user: AuthUser,
    @Param('boardId', uuidParam('Invalid board id')) boardId: string,
  ): Promise<BoardDetails> {
    return this.boards.get(boardId, user.id);
  }

  // PATCH /api/boards/:boardId → the renamed board
  @Patch(':boardId')
  @ApiDoc({
    summary: 'Rename a board',
    status: 200,
    returns: boardSummarySchema,
    errors: { 400: 'Invalid board id or name', 404: 'No such board, or I am not in its family' },
  })
  rename(
    @CurrentUser() user: AuthUser,
    @Param('boardId', uuidParam('Invalid board id')) boardId: string,
    @ZodBody(boardNameSchema) body: BoardNameRequest,
  ): Promise<BoardSummary> {
    return this.boards.rename(boardId, user.id, body);
  }

  // DELETE /api/boards/:boardId → 204; the columns and cards are deleted with it
  @Delete(':boardId')
  @HttpCode(204)
  @ApiDoc({
    summary: 'Delete a board with all its columns and cards',
    status: 204,
    errors: { 400: 'Invalid board id', 404: 'No such board, or I am not in its family' },
  })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('boardId', uuidParam('Invalid board id')) boardId: string,
  ): Promise<void> {
    return this.boards.remove(boardId, user.id);
  }
}
