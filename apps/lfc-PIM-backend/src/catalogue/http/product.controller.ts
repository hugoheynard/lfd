import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../infra/auth/public.decorator.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { ProductCommands } from '../application/product-commands.service.js';
import { EditorialReader } from '../domain/ports/editorial-reader.js';
import { ProductRepository } from '../domain/ports/product.repository.js';

const nutritionShape = z
  .object({
    energyKcal: z.number().optional(),
    carbsG: z.number().optional(),
    fatG: z.number().optional(),
    proteinG: z.number().optional(),
    glycemicIndex: z.number().optional(),
  })
  .optional();

const editorialShape = {
  descriptionShort: z.string().optional(),
  descriptionLong: z.string().optional(),
  story: z.string().optional(),
  pairing: z.string().optional(),
  brand: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
};

const productPayload = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
  kind: z.enum(['daily', 'made_to_order', 'resale']),
  categoryId: z.string().min(1),
  sku: z.string().optional(),
  allergens: z.array(z.string()).optional(),
  mayContain: z.array(z.string()).optional(),
  nutrition: nutritionShape,
  editorial: z.object(editorialShape).optional(),
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

const editorialPayload = z.object(editorialShape);

const nutritionPayload = z.object({
  allergens: z.array(z.string()),
  mayContain: z.array(z.string()).optional(),
  nutrition: nutritionShape,
});

/**
 * Produits du catalogue. ⚠️ **`@Public()` temporaire** (tenant Auth0 absent) :
 * à retirer dès que `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` sont renseignés — dette
 * suivie dans `todo.md`.
 */
@Public()
@Controller('catalogue/products')
export class ProductController {
  constructor(
    private readonly productCommands: ProductCommands,
    private readonly products: ProductRepository,
    private readonly editorials: EditorialReader,
  ) {}

  @Get()
  listProducts() {
    return this.products.listAll();
  }

  /** Détail complet d'un produit : le socle + sa couche éditoriale (pour l'édition). */
  @Get(':id')
  async getProduct(@Param('id') id: string) {
    const product = await this.products.findById(id);
    if (product === null) {
      return null;
    }
    const editorial = await this.editorials.findByProduct(id);
    return { ...product, editorial };
  }

  @Post()
  async createProduct(
    @Body(new ZodBody(productPayload)) body: z.infer<typeof productPayload>,
  ) {
    return { id: await this.productCommands.create(body) };
  }

  @Put(':id/name')
  async renameProduct(
    @Param('id') id: string,
    @Body(new ZodBody(renamePayload)) body: z.infer<typeof renamePayload>,
  ) {
    await this.productCommands.rename(id, body.nameFr, body.nameEn);
    return { id };
  }

  @Put(':id/kind')
  async changeProductKind(
    @Param('id') id: string,
    @Body(new ZodBody(kindPayload)) body: z.infer<typeof kindPayload>,
  ) {
    await this.productCommands.changeKind(id, body.kind);
    return { id };
  }

  @Put(':id/category')
  async moveProduct(
    @Param('id') id: string,
    @Body(new ZodBody(categoryRefPayload))
    body: z.infer<typeof categoryRefPayload>,
  ) {
    await this.productCommands.moveToCategory(id, body.categoryId);
    return { id };
  }

  @Put(':id/editorial')
  async editProductEditorial(
    @Param('id') id: string,
    @Body(new ZodBody(editorialPayload)) body: z.infer<typeof editorialPayload>,
  ) {
    await this.productCommands.updateEditorial(id, body);
    return { id };
  }

  @Put(':id/variants/:variantId/price')
  async setVariantPrice(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodBody(pricePayload)) body: z.infer<typeof pricePayload>,
  ) {
    await this.productCommands.setVariantPrice(id, variantId, body.priceCents);
    return { id, variantId };
  }

  @Put(':id/variants/:variantId/weight')
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

  @Put(':id/variants/:variantId/nutrition')
  async declareVariantNutrition(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodBody(nutritionPayload)) body: z.infer<typeof nutritionPayload>,
  ) {
    await this.productCommands.declareNutrition(id, variantId, body);
    return { id, variantId };
  }

  @Put(':id/archive')
  async archiveProduct(@Param('id') id: string) {
    await this.productCommands.archive(id);
    return { id };
  }

  @Put(':id/restore')
  async restoreProduct(@Param('id') id: string) {
    await this.productCommands.restore(id);
    return { id };
  }
}
