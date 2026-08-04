import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../infra/auth/public.decorator.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { CategoryCommands } from '../application/category-commands.service.js';
import { CategoryRepository } from '../domain/ports/category.repository.js';

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
 * Familles du catalogue. ⚠️ **`@Public()` temporaire** (tenant Auth0 absent) :
 * à retirer dès que `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` sont renseignés — dette
 * suivie dans `todo.md`.
 */
@Public()
@Controller('catalogue/categories')
export class CategoryController {
  constructor(
    private readonly categoryCommands: CategoryCommands,
    private readonly categories: CategoryRepository,
  ) {}

  @Get()
  listCategories() {
    return this.categories.listAll();
  }

  @Post()
  async createCategory(
    @Body(new ZodBody(categoryPayload)) body: z.infer<typeof categoryPayload>,
  ) {
    return { id: await this.categoryCommands.create(body) };
  }

  @Put(':id/name')
  async renameCategory(
    @Param('id') id: string,
    @Body(new ZodBody(renamePayload)) body: z.infer<typeof renamePayload>,
  ) {
    await this.categoryCommands.rename(id, body);
    return { id };
  }

  @Put(':id/archive')
  async archiveCategory(@Param('id') id: string) {
    await this.categoryCommands.archive(id);
    return { id };
  }
}
