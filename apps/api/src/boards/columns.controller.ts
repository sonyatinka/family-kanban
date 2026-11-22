import { Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  columnNameSchema,
  columnSummarySchema,
  moveColumnSchema,
  type ColumnNameRequest,
  type ColumnSummary,
  type MoveColumnRequest,
} from '@family/shared';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { uuidParam } from '../common/uuid-param';
import { ZodBody } from '../common/zod-body.decorator';
import { ApiDoc } from '../swagger/api-doc.decorator';
import { ColumnsService } from './columns.service';

// Adding a column to a board
@ApiTags('columns')
@Controller('boards/:boardId/columns')
export class BoardColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  // POST /api/boards/:boardId/columns → 201, the new column at the end of the board
  @Post()
  @ApiDoc({
    summary: 'Add a column at the end of the board',
    status: 201,
    returns: columnSummarySchema,
    errors: {
      400: 'Invalid board id or column name',
      404: 'No such board, or I am not in its family',
      409: 'The board is changing right now (three attempts failed), try again',
    },
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param('boardId', uuidParam('Invalid board id')) boardId: string,
    @ZodBody(columnNameSchema) body: ColumnNameRequest,
  ): Promise<ColumnSummary> {
    return this.columns.create(boardId, user.id, body);
  }
}

// One column, addressed by its own id (the service checks the board's family)
@ApiTags('columns')
@Controller('columns')
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  // PATCH /api/columns/:columnId → the renamed column
  @Patch(':columnId')
  @ApiDoc({
    summary: 'Rename a column',
    status: 200,
    returns: columnSummarySchema,
    errors: { 400: 'Invalid column id or name', 404: 'No such column, or I am not in its family' },
  })
  rename(
    @CurrentUser() user: AuthUser,
    @Param('columnId', uuidParam('Invalid column id')) columnId: string,
    @ZodBody(columnNameSchema) body: ColumnNameRequest,
  ): Promise<ColumnSummary> {
    return this.columns.rename(columnId, user.id, body);
  }

  // POST /api/columns/:columnId/move → 200, the column with its new position
  @Post(':columnId/move')
  @HttpCode(200)
  @ApiDoc({
    summary: 'Move a column after another one, or first',
    description: 'The server computes the new position key; the client only says where.',
    status: 200,
    returns: columnSummarySchema,
    errors: {
      400: 'Invalid id, or the column is placed after itself',
      404: 'No such column, or I am not in its family',
      409: 'afterColumnId is not on this board (reload it), or the board is busy',
    },
  })
  move(
    @CurrentUser() user: AuthUser,
    @Param('columnId', uuidParam('Invalid column id')) columnId: string,
    @ZodBody(moveColumnSchema) body: MoveColumnRequest,
  ): Promise<ColumnSummary> {
    return this.columns.move(columnId, user.id, body);
  }

  // DELETE /api/columns/:columnId → 204; 409 if the column still has cards
  @Delete(':columnId')
  @HttpCode(204)
  @ApiDoc({
    summary: 'Delete an empty column',
    status: 204,
    errors: {
      400: 'Invalid column id',
      404: 'No such column, or I am not in its family',
      409: 'The column has cards: move or delete them first',
    },
  })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('columnId', uuidParam('Invalid column id')) columnId: string,
  ): Promise<void> {
    return this.columns.remove(columnId, user.id);
  }
}
