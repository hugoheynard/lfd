import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../infra/auth/public.decorator.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { CategoryCommands } from '../application/category-commands.service.js';
import { ProductCommands } from '../application/product-commands.service.js';
import { CategoryRepository } from '../domain/ports/category.repository.js';
import { EditorialReader } from '../domain/ports/editorial-reader.js';
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

const kindPayload = z.object({
  kind: z.enum(['daily', 'made_to_order', 'resale']),
});

const categoryRefPayload = z.object({
  categoryId: z.string().min(1),
});

/** `null` = dé-tarifer / effacer ; un entier ≥ 0 = valeur en centimes / grammes. */
const pricePayload = z.object({
  priceCents: z.number().int().min(0).nullable(),
});

const weightPayload = z.object({
  weightGrams: z.number().int().min(0).nullable(),
});

const editorialPayload = z.object({
  descriptionShort: z.string().optional(),
  descriptionLong: z.string().optional(),
  story: z.string().optional(),
  pairing: z.string().optional(),
  brand: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

const nutritionPayload = z.object({
  allergens: z.array(z.string()),
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
    private readonly editorials: EditorialReader,
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

  /** Détail complet d'un produit : le socle + sa couche éditoriale (pour l'édition). */
  @Get('products/:id')
  async getProduct(@Param('id') id: string) {
    const product = await this.products.findById(id);
    if (product === null) {
      return null;
    }
    const editorial = await this.editorials.findByProduct(id);
    return { ...product, editorial };
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

  @Put('products/:id/kind')
  async changeProductKind(
    @Param('id') id: string,
    @Body(new ZodBody(kindPayload)) body: z.infer<typeof kindPayload>,
  ) {
    await this.productCommands.changeKind(id, body.kind);
    return { id };
  }

  @Put('products/:id/category')
  async moveProduct(
    @Param('id') id: string,
    @Body(new ZodBody(categoryRefPayload))
    body: z.infer<typeof categoryRefPayload>,
  ) {
    await this.productCommands.moveToCategory(id, body.categoryId);
    return { id };
  }

  @Put('products/:id/editorial')
  async editProductEditorial(
    @Param('id') id: string,
    @Body(new ZodBody(editorialPayload)) body: z.infer<typeof editorialPayload>,
  ) {
    await this.productCommands.updateEditorial(id, body);
    return { id };
  }

  @Put('products/:id/variants/:variantId/price')
  async setVariantPrice(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodBody(pricePayload)) body: z.infer<typeof pricePayload>,
  ) {
    await this.productCommands.setVariantPrice(id, variantId, body.priceCents);
    return { id, variantId };
  }

  @Put('products/:id/variants/:variantId/weight')
  async setVariantWeight(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodBody(weightPayload)) body: z.infer<typeof weightPayload>,
  ) {
    await this.productCommands.setVariantWeight(
      id,
      variantId,
      body.weightGrams,
    );
    return { id, variantId };
  }

  @Put('products/:id/variants/:variantId/nutrition')
  async declareVariantNutrition(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodBody(nutritionPayload)) body: z.infer<typeof nutritionPayload>,
  ) {
    await this.productCommands.declareNutrition(id, variantId, body);
    return { id, variantId };
  }

  @Put('products/:id/archive')
  async archiveProduct(@Param('id') id: string) {
    await this.productCommands.archive(id);
    return { id };
  }

  @Put('products/:id/restore')
  async restoreProduct(@Param('id') id: string) {
    await this.productCommands.restore(id);
    return { id };
  }
}
