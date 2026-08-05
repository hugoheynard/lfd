import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';

import { Public } from '../../infra/auth/public.decorator.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { ArchiveCategoryCommand } from '../application/archive-category.js';
import { CreateCategoryCommand } from '../application/create-category.js';
import { ListCategoriesQuery } from '../application/list-categories.js';
import { RenameCategoryCommand } from '../application/rename-category.js';
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

  @Put(':id/archive')
  async archiveCategory(@Param('id') id: string) {
    await this.commands.execute<ArchiveCategoryCommand, void>(
      new ArchiveCategoryCommand(id),
    );
    return { id };
  }
}
