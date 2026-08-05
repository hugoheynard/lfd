import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';

import { Public } from '../../infra/auth/public.decorator.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { ArchiveProductCommand } from '../application/archive-product.js';
import { CreateProductCommand } from '../application/create-product.js';
import { DeclareProductNutritionCommand } from '../application/declare-product-nutrition.js';
import {
  GetProductDetailQuery,
  type ProductDetail,
} from '../application/get-product-detail.js';
import { ListProductsQuery } from '../application/list-products.js';
import { RestoreProductCommand } from '../application/restore-product.js';
import { UpdateProductEditorialCommand } from '../application/update-product-editorial.js';
import { UpdateProductIdentityCommand } from '../application/update-product-identity.js';
import { UpdateVariantPricingCommand } from '../application/update-variant-pricing.js';
import type { ProductRecord } from '../domain/ports/product.repository.js';

const kindEnum = z.enum(['daily', 'made_to_order', 'resale']);

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
  kind: kindEnum,
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

/** Section « Identité » — enregistrée en une fois (pas champ par champ). */
const identityPayload = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
  kind: kindEnum,
  categoryId: z.string().min(1),
});

/** Section « Tarif & logistique » d'une déclinaison. `null` = effacer. */
const pricingPayload = z.object({
  priceCents: z.number().int().min(0).nullable(),
  weightGrams: z.number().int().min(0).nullable(),
});

const editorialPayload = z.object(editorialShape);

const nutritionPayload = z.object({
  allergens: z.array(z.string()),
  mayContain: z.array(z.string()).optional(),
  nutrition: nutritionShape,
});

/**
 * Produits du catalogue — dispatchés sur les bus CQRS. L'édition se fait **par
 * section** (une requête par section, pas par champ). ⚠️ **`@Public()` temporaire**
 * (tenant Auth0 absent), dette suivie dans `todo.md`.
 */
@Public()
@Controller('catalogue/products')
export class ProductController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  listProducts(): Promise<ProductRecord[]> {
    return this.queries.execute<ListProductsQuery, ProductRecord[]>(
      new ListProductsQuery(),
    );
  }

  /** Détail complet d'un produit : le socle + sa couche éditoriale (pour l'édition). */
  @Get(':id')
  getProduct(@Param('id') id: string): Promise<ProductDetail | null> {
    return this.queries.execute<GetProductDetailQuery, ProductDetail | null>(
      new GetProductDetailQuery(id),
    );
  }

  @Post()
  async createProduct(
    @Body(new ZodBody(productPayload)) body: z.infer<typeof productPayload>,
  ) {
    const id = await this.commands.execute<CreateProductCommand, string>(
      new CreateProductCommand(body),
    );
    return { id };
  }

  /** Section Identité : nom + nature + famille en une opération. */
  @Put(':id/identity')
  async updateIdentity(
    @Param('id') id: string,
    @Body(new ZodBody(identityPayload)) body: z.infer<typeof identityPayload>,
  ) {
    await this.commands.execute<UpdateProductIdentityCommand, void>(
      new UpdateProductIdentityCommand(id, body),
    );
    return { id };
  }

  /** Section Description (couche éditoriale). */
  @Put(':id/editorial')
  async editProductEditorial(
    @Param('id') id: string,
    @Body(new ZodBody(editorialPayload)) body: z.infer<typeof editorialPayload>,
  ) {
    await this.commands.execute<UpdateProductEditorialCommand, void>(
      new UpdateProductEditorialCommand(id, body),
    );
    return { id };
  }

  /** Section Tarif & logistique : prix + poids de la déclinaison en une opération. */
  @Put(':id/variants/:variantId/pricing')
  async setVariantPricing(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodBody(pricingPayload)) body: z.infer<typeof pricingPayload>,
  ) {
    await this.commands.execute<UpdateVariantPricingCommand, void>(
      new UpdateVariantPricingCommand(id, variantId, body),
    );
    return { id, variantId };
  }

  /** Section Allergènes (fiche réglementaire de la déclinaison). */
  @Put(':id/variants/:variantId/nutrition')
  async declareVariantNutrition(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodBody(nutritionPayload)) body: z.infer<typeof nutritionPayload>,
  ) {
    await this.commands.execute<DeclareProductNutritionCommand, void>(
      new DeclareProductNutritionCommand(id, variantId, body),
    );
    return { id, variantId };
  }

  @Put(':id/archive')
  async archiveProduct(@Param('id') id: string) {
    await this.commands.execute<ArchiveProductCommand, void>(
      new ArchiveProductCommand(id),
    );
    return { id };
  }

  @Put(':id/restore')
  async restoreProduct(@Param('id') id: string) {
    await this.commands.execute<RestoreProductCommand, void>(
      new RestoreProductCommand(id),
    );
    return { id };
  }
}
