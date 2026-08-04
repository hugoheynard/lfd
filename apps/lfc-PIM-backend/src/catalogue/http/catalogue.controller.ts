import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../infra/auth/public.decorator.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { CategoryCommands } from '../application/category-commands.service.js';
import { ProductCommands } from '../application/product-commands.service.js';
import { CategoryRepository } from '../domain/ports/category.repository.js';
import { ProductRepository } from '../domain/ports/product.repository.js';

const categoryPayload = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
  parentId: z.string().optional(),
});

const productPayload = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
  kind: z.enum(['daily', 'made_to_order', 'resale']),
  categoryId: z.string().min(1),
  sku: z.string().optional(),
  allergens: z.array(z.string()).optional(),
  mayContain: z.array(z.string()).optional(),
  nutrition: z
    .object({
      energyKcal: z.number().optional(),
      carbsG: z.number().optional(),
      fatG: z.number().optional(),
      proteinG: z.number().optional(),
      glycemicIndex: z.number().optional(),
    })
    .optional(),
  editorial: z
    .object({
      descriptionShort: z.string().optional(),
      descriptionLong: z.string().optional(),
      story: z.string().optional(),
      pairing: z.string().optional(),
      brand: z.string().optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
    })
    .optional(),
  media: z
    .array(
      z.object({
        role: z.string(),
        url: z.string(),
        alt: z.string().optional(),
      }),
    )
    .optional(),
});

const renamePayload = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
});

/**
 * ⚠️ **`@Public()` temporaire.** Le tenant Auth0 n'existe pas encore : sans dérogation,
 * le guard global rejetterait tout et le back-office serait inutilisable. À retirer dès
 * que `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` sont renseignés — dette suivie dans `todo.md`.
 */
@Public()
@Controller('catalogue')
export class CatalogueController {
  constructor(
    private readonly categoryCommands: CategoryCommands,
    private readonly productCommands: ProductCommands,
    private readonly categories: CategoryRepository,
    private readonly products: ProductRepository,
  ) {}

  @Get('categories')
  listCategories() {
    return this.categories.listAll();
  }

  @Post('categories')
  async createCategory(
    @Body(new ZodBody(categoryPayload)) body: z.infer<typeof categoryPayload>,
  ) {
    return { id: await this.categoryCommands.create(body) };
  }

  @Put('categories/:id/name')
  async renameCategory(
    @Param('id') id: string,
    @Body(new ZodBody(renamePayload)) body: z.infer<typeof renamePayload>,
  ) {
    await this.categoryCommands.rename(id, body);
    return { id };
  }

  @Put('categories/:id/archive')
  async archiveCategory(@Param('id') id: string) {
    await this.categoryCommands.archive(id);
    return { id };
  }

  @Get('products')
  listProducts() {
    return this.products.listAll();
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.products.findById(id);
  }

  @Post('products')
  async createProduct(
    @Body(new ZodBody(productPayload)) body: z.infer<typeof productPayload>,
  ) {
    return { id: await this.productCommands.create(body) };
  }

  @Put('products/:id/name')
  async renameProduct(
    @Param('id') id: string,
    @Body(new ZodBody(renamePayload)) body: z.infer<typeof renamePayload>,
  ) {
    await this.productCommands.rename(id, body.nameFr, body.nameEn);
    return { id };
  }

  @Put('products/:id/archive')
  async archiveProduct(@Param('id') id: string) {
    await this.productCommands.archive(id);
    return { id };
  }
}
