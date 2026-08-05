import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';

import { Public } from '../../infra/auth/public.decorator.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { ArchiveCategoryCommand } from '../application/archive-category.js';
import { CreateCategoryCommand } from '../application/create-category.js';
import { ListCategoriesQuery } from '../application/list-categories.js';
import { RenameCategoryCommand } from '../application/rename-category.js';
import { SetCategoryChannelsCommand } from '../application/set-category-channels.js';
import { SetCategoryTvaCommand } from '../application/set-category-tva.js';
import type { CategoryRecord } from '../domain/ports/category.repository.js';

const categoryPayload = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
  parentId: z.string().optional(),
});

const renamePayload = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
});

const boutiqueChannels = z.object({
  emporter: z.boolean(),
  surPlace: z.boolean(),
});

const channelsPayload = z.object({
  b1: boutiqueChannels,
  b2: boutiqueChannels,
});

const tvaPayload = z.object({
  emporterTvaId: z.string().nullable(),
  surPlaceTvaId: z.string().nullable(),
});

/**
 * Familles du catalogue — dispatchées sur les bus CQRS. ⚠️ **`@Public()`
 * temporaire** (tenant Auth0 absent), dette suivie dans `todo.md`.
 */
@Public()
@Controller('catalogue/categories')
export class CategoryController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  listCategories(): Promise<CategoryRecord[]> {
    return this.queries.execute<ListCategoriesQuery, CategoryRecord[]>(
      new ListCategoriesQuery(),
    );
  }

  @Post()
  async createCategory(
    @Body(new ZodBody(categoryPayload)) body: z.infer<typeof categoryPayload>,
  ) {
    const id = await this.commands.execute<CreateCategoryCommand, string>(
      new CreateCategoryCommand(body),
    );
    return { id };
  }

  @Put(':id/name')
  async renameCategory(
    @Param('id') id: string,
    @Body(new ZodBody(renamePayload)) body: z.infer<typeof renamePayload>,
  ) {
    await this.commands.execute<RenameCategoryCommand, void>(
      new RenameCategoryCommand(id, body),
    );
    return { id };
  }

  @Put(':id/channels')
  async setChannels(
    @Param('id') id: string,
    @Body(new ZodBody(channelsPayload)) body: z.infer<typeof channelsPayload>,
  ) {
    await this.commands.execute<SetCategoryChannelsCommand, void>(
      new SetCategoryChannelsCommand(id, body),
    );
    return { id };
  }

  @Put(':id/tva')
  async setTva(
    @Param('id') id: string,
    @Body(new ZodBody(tvaPayload)) body: z.infer<typeof tvaPayload>,
  ) {
    await this.commands.execute<SetCategoryTvaCommand, void>(
      new SetCategoryTvaCommand(id, body.emporterTvaId, body.surPlaceTvaId),
    );
    return { id };
  }

  @Put(':id/archive')
  async archiveCategory(@Param('id') id: string) {
    await this.commands.execute<ArchiveCategoryCommand, void>(
      new ArchiveCategoryCommand(id),
    );
    return { id };
  }
}
