import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';

import { Public } from '../../infra/auth/public.decorator.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { CreateTvaRegimeCommand } from '../application/create-tva-regime.js';
import { ListTvaRegimesQuery } from '../application/list-tva-regimes.js';
import { RemoveTvaRegimeCommand } from '../application/remove-tva-regime.js';
import { UpdateTvaRegimeCommand } from '../application/update-tva-regime.js';
import type { TvaRegimeRecord } from '../domain/ports/tva-regime.repository.js';

const regimePayload = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  percent: z.number().positive(),
});

/**
 * Régimes de **TVA** — référence commerciale partagée (catégories + Shopify). Le
 * contrôleur ne fait que **dispatcher** sur les bus CQRS : commandes qui mutent,
 * requête qui lit.
 *
 * ⚠️ `@Public()` temporaire — même dérogation que le catalogue (Auth0 non câblé).
 */
@Public()
@Controller('commerce/tva-regimes')
export class TvaRegimeController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<TvaRegimeRecord[]> {
    return this.queries.execute<ListTvaRegimesQuery, TvaRegimeRecord[]>(
      new ListTvaRegimesQuery(),
    );
  }

  @Post()
  async create(
    @Body(new ZodBody(regimePayload)) body: z.infer<typeof regimePayload>,
  ) {
    const id = await this.commands.execute<CreateTvaRegimeCommand, string>(
      new CreateTvaRegimeCommand(body),
    );
    return { id };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodBody(regimePayload)) body: z.infer<typeof regimePayload>,
  ) {
    await this.commands.execute<UpdateTvaRegimeCommand, void>(
      new UpdateTvaRegimeCommand(id, body),
    );
    return { id };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.commands.execute<RemoveTvaRegimeCommand, void>(
      new RemoveTvaRegimeCommand(id),
    );
    return { id };
  }
}
