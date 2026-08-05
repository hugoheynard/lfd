import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';

import { Public } from '../../infra/auth/public.decorator.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { CreateEmplacementCommand } from '../application/create-emplacement.js';
import { DeleteEmplacementCommand } from '../application/delete-emplacement.js';
import { GenerateTableQrCommand } from '../application/generate-table-qr.js';
import { ListEmplacementsQuery } from '../application/list-emplacements.js';
import { RemoveTableQrCommand } from '../application/remove-table-qr.js';
import { UpdateEmplacementCommand } from '../application/update-emplacement.js';
import type { EmplacementRecord } from '../domain/ports/emplacement.repository.js';
import { MAX_TABLES } from '../domain/value-objects/table.js';

const tableCount = z.number().int().min(0).max(MAX_TABLES);

const createPayload = z.object({
  name: z.string().min(1),
  clickCollect: z.boolean(),
  surPlace: z.boolean(),
  baseUrl: z.string(),
  tableCount,
});

const updatePayload = z.object({
  name: z.string().min(1).optional(),
  clickCollect: z.boolean().optional(),
  surPlace: z.boolean().optional(),
  baseUrl: z.string().optional(),
  tableCount: tableCount.optional(),
});

/**
 * Emplacements (boutiques : modes + tables + QR click & collect) — dispatchés sur
 * les bus CQRS. ⚠️ **`@Public()` temporaire** (tenant Auth0 absent), dette `todo.md`.
 */
@Public()
@Controller('locations/emplacements')
export class EmplacementController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  listEmplacements(): Promise<EmplacementRecord[]> {
    return this.queries.execute<ListEmplacementsQuery, EmplacementRecord[]>(
      new ListEmplacementsQuery(),
    );
  }

  @Post()
  async createEmplacement(
    @Body(new ZodBody(createPayload)) body: z.infer<typeof createPayload>,
  ) {
    const id = await this.commands.execute<CreateEmplacementCommand, string>(
      new CreateEmplacementCommand(body),
    );
    return { id };
  }

  @Put(':id')
  async updateEmplacement(
    @Param('id') id: string,
    @Body(new ZodBody(updatePayload)) body: z.infer<typeof updatePayload>,
  ) {
    await this.commands.execute<UpdateEmplacementCommand, void>(
      new UpdateEmplacementCommand(id, body),
    );
    return { id };
  }

  @Delete(':id')
  async deleteEmplacement(@Param('id') id: string) {
    await this.commands.execute<DeleteEmplacementCommand, void>(
      new DeleteEmplacementCommand(id),
    );
    return { id };
  }

  @Post(':id/tables/:number/qr')
  async generateTableQr(
    @Param('id') id: string,
    @Param('number', ParseIntPipe) tableNumber: number,
  ) {
    const token = await this.commands.execute<GenerateTableQrCommand, string>(
      new GenerateTableQrCommand(id, tableNumber),
    );
    return { token };
  }

  @Delete(':id/tables/:number/qr')
  async removeTableQr(
    @Param('id') id: string,
    @Param('number', ParseIntPipe) tableNumber: number,
  ) {
    await this.commands.execute<RemoveTableQrCommand, void>(
      new RemoveTableQrCommand(id, tableNumber),
    );
    return { id, tableNumber };
  }
}
