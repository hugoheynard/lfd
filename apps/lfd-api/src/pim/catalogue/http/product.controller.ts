import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  createProductPayloadSchema,
  declareNutritionPayloadSchema,
  productEditorialPayloadSchema,
  updateProductIdentityPayloadSchema,
  updateVariantPricingPayloadSchema,
  type CreateProductPayload,
  type DeclareNutritionPayload,
  type ProductDetailView,
  type ProductEditorialPayload,
  type ProductView,
  type UpdateProductIdentityPayload,
  type UpdateVariantPricingPayload,
} from "@lfd/pim-contracts";

import { Public } from "../../../infra/auth/public.decorator.js";
import { ZodBody } from "../../../shared/http/zod-body.pipe.js";
import { ArchiveProductCommand } from "../application/archive-product.js";
import { CreateProductCommand } from "../application/create-product.js";
import { DeclareProductNutritionCommand } from "../application/declare-product-nutrition.js";
import { GetProductDetailQuery } from "../application/get-product-detail.js";
import { ListProductsQuery } from "../application/list-products.js";
import { RestoreProductCommand } from "../application/restore-product.js";
import { UpdateProductEditorialCommand } from "../application/update-product-editorial.js";
import { UpdateProductIdentityCommand } from "../application/update-product-identity.js";
import { UpdateVariantPricingCommand } from "../application/update-variant-pricing.js";

/**
 * Produits du catalogue — dispatchés sur les bus CQRS. L'édition se fait **par
 * section** (une requête par section, pas par champ). ⚠️ **`@Public()` temporaire**
 * (tenant Auth0 absent), dette suivie dans `todo.md`.
 */
@Public()
@Controller("catalogue/products")
export class ProductController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  listProducts(): Promise<ProductView[]> {
    return this.queries.execute<ListProductsQuery, ProductView[]>(new ListProductsQuery());
  }

  /** Détail complet d'un produit : le socle + sa couche éditoriale (pour l'édition). */
  @Get(":id")
  getProduct(@Param("id") id: string): Promise<ProductDetailView | null> {
    return this.queries.execute<GetProductDetailQuery, ProductDetailView | null>(
      new GetProductDetailQuery(id),
    );
  }

  @Post()
  async createProduct(@Body(new ZodBody(createProductPayloadSchema)) body: CreateProductPayload) {
    const id = await this.commands.execute<CreateProductCommand, string>(
      new CreateProductCommand(body),
    );
    return { id };
  }

  /** Section Identité : nom + nature + famille en une opération. */
  @Put(":id/identity")
  async updateIdentity(
    @Param("id") id: string,
    @Body(new ZodBody(updateProductIdentityPayloadSchema))
    body: UpdateProductIdentityPayload,
  ) {
    await this.commands.execute<UpdateProductIdentityCommand, void>(
      new UpdateProductIdentityCommand(id, body),
    );
    return { id };
  }

  /** Section Description (couche éditoriale). */
  @Put(":id/editorial")
  async editProductEditorial(
    @Param("id") id: string,
    @Body(new ZodBody(productEditorialPayloadSchema))
    body: ProductEditorialPayload,
  ) {
    await this.commands.execute<UpdateProductEditorialCommand, void>(
      new UpdateProductEditorialCommand(id, body),
    );
    return { id };
  }

  /** Section Tarif & logistique : prix + poids de la déclinaison en une opération. */
  @Put(":id/variants/:variantId/pricing")
  async setVariantPricing(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body(new ZodBody(updateVariantPricingPayloadSchema))
    body: UpdateVariantPricingPayload,
  ) {
    await this.commands.execute<UpdateVariantPricingCommand, void>(
      new UpdateVariantPricingCommand(id, variantId, body),
    );
    return { id, variantId };
  }

  /** Section Allergènes (fiche réglementaire de la déclinaison). */
  @Put(":id/variants/:variantId/nutrition")
  async declareVariantNutrition(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body(new ZodBody(declareNutritionPayloadSchema))
    body: DeclareNutritionPayload,
  ) {
    await this.commands.execute<DeclareProductNutritionCommand, void>(
      new DeclareProductNutritionCommand(id, variantId, body),
    );
    return { id, variantId };
  }

  @Put(":id/archive")
  async archiveProduct(@Param("id") id: string) {
    await this.commands.execute<ArchiveProductCommand, void>(new ArchiveProductCommand(id));
    return { id };
  }

  @Put(":id/restore")
  async restoreProduct(@Param("id") id: string) {
    await this.commands.execute<RestoreProductCommand, void>(new RestoreProductCommand(id));
    return { id };
  }
}
