import { Body, Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  columnNameSchema,
  moveColumnSchema,
  type ColumnNameRequest,
  type ColumnSummary,
  type MoveColumnRequest,
} from '@family/shared';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { uuidParam } from '../common/uuid-param';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ColumnsService } from './columns.service';

// Adding a column to a board
@Controller('boards/:boardId/columns')
export class BoardColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  // POST /api/boards/:boardId/columns → 201, the new column at the end of the board
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('boardId', uuidParam('Invalid board id')) boardId: string,
    @Body(new ZodValidationPipe(columnNameSchema)) body: ColumnNameRequest,
  ): Promise<ColumnSummary> {
    return this.columns.create(boardId, user.id, body);
  }
}

// One column, addressed by its own id (the service checks the board's family)
@Controller('columns')
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  // PATCH /api/columns/:columnId → the renamed column
  @Patch(':columnId')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('columnId', uuidParam('Invalid column id')) columnId: string,
    @Body(new ZodValidationPipe(columnNameSchema)) body: ColumnNameRequest,
  ): Promise<ColumnSummary> {
    return this.columns.rename(columnId, user.id, body);
  }

  // POST /api/columns/:columnId/move → 200, the column with its new position
  @Post(':columnId/move')
  @HttpCode(200)
  move(
    @CurrentUser() user: AuthUser,
    @Param('columnId', uuidParam('Invalid column id')) columnId: string,
    @Body(new ZodValidationPipe(moveColumnSchema)) body: MoveColumnRequest,
  ): Promise<ColumnSummary> {
    return this.columns.move(columnId, user.id, body);
  }

  // DELETE /api/columns/:columnId → 204; 409 if the column still has cards
  @Delete(':columnId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('columnId', uuidParam('Invalid column id')) columnId: string,
  ): Promise<void> {
    return this.columns.remove(columnId, user.id);
  }
}
