import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  createCategoryPayloadSchema,
  renameCategoryPayloadSchema,
  setCategoryChannelsPayloadSchema,
  setCategoryTvaPayloadSchema,
  type CategoryView,
  type CreateCategoryPayload,
  type RenameCategoryPayload,
  type SetCategoryChannelsPayload,
  type SetCategoryTvaPayload,
} from '@lfd/pim-contracts';

import { Public } from '../../infra/auth/public.decorator.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { ArchiveCategoryCommand } from '../application/archive-category.js';
import { CreateCategoryCommand } from '../application/create-category.js';
import { ListCategoriesQuery } from '../application/list-categories.js';
import { RenameCategoryCommand } from '../application/rename-category.js';
import { SetCategoryChannelsCommand } from '../application/set-category-channels.js';
import { SetCategoryTvaCommand } from '../application/set-category-tva.js';

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
  listCategories(): Promise<CategoryView[]> {
    return this.queries.execute<ListCategoriesQuery, CategoryView[]>(
      new ListCategoriesQuery(),
    );
  }

  @Post()
  async createCategory(
    @Body(new ZodBody(createCategoryPayloadSchema)) body: CreateCategoryPayload,
  ) {
    const id = await this.commands.execute<CreateCategoryCommand, string>(
      new CreateCategoryCommand(body),
    );
    return { id };
  }

  @Put(':id/name')
  async renameCategory(
    @Param('id') id: string,
    @Body(new ZodBody(renameCategoryPayloadSchema)) body: RenameCategoryPayload,
  ) {
    await this.commands.execute<RenameCategoryCommand, void>(
      new RenameCategoryCommand(id, body),
    );
    return { id };
  }

  @Put(':id/channels')
  async setChannels(
    @Param('id') id: string,
    @Body(new ZodBody(setCategoryChannelsPayloadSchema))
    body: SetCategoryChannelsPayload,
  ) {
    await this.commands.execute<SetCategoryChannelsCommand, void>(
      new SetCategoryChannelsCommand(id, body),
    );
    return { id };
  }

  @Put(':id/tva')
  async setTva(
    @Param('id') id: string,
    @Body(new ZodBody(setCategoryTvaPayloadSchema)) body: SetCategoryTvaPayload,
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
