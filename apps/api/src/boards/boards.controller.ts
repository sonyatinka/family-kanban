import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  boardNameSchema,
  type BoardDetails,
  type BoardNameRequest,
  type BoardSummary,
} from '@family/shared';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { uuidParam } from '../common/uuid-param';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BoardsService } from './boards.service';

// A family's boards. Membership is checked in the service: non-members get 404
@Controller('families/:familyId/boards')
export class FamilyBoardsController {
  constructor(private readonly boards: BoardsService) {}

  // POST /api/families/:familyId/boards → 201, the new board with its default columns
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('familyId', uuidParam('Invalid family id')) familyId: string,
    @Body(new ZodValidationPipe(boardNameSchema)) body: BoardNameRequest,
  ): Promise<BoardDetails> {
    return this.boards.create(familyId, user.id, body);
  }

  // GET /api/families/:familyId/boards → the family's boards, oldest first
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('familyId', uuidParam('Invalid family id')) familyId: string,
  ): Promise<BoardSummary[]> {
    return this.boards.list(familyId, user.id);
  }
}

// One board. The URL has no family id: nesting every level (/families/…/boards/…/columns/…)
// makes long URLs. The service finds the board's family and checks that the caller is in it
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  // GET /api/boards/:boardId → the board with its columns and cards
  @Get(':boardId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('boardId', uuidParam('Invalid board id')) boardId: string,
  ): Promise<BoardDetails> {
    return this.boards.get(boardId, user.id);
  }

  // PATCH /api/boards/:boardId → the renamed board
  @Patch(':boardId')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('boardId', uuidParam('Invalid board id')) boardId: string,
    @Body(new ZodValidationPipe(boardNameSchema)) body: BoardNameRequest,
  ): Promise<BoardSummary> {
    return this.boards.rename(boardId, user.id, body);
  }

  // DELETE /api/boards/:boardId → 204; the columns and cards are deleted with it
  @Delete(':boardId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('boardId', uuidParam('Invalid board id')) boardId: string,
  ): Promise<void> {
    return this.boards.remove(boardId, user.id);
  }
}
