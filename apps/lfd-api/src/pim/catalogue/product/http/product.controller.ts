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
  setProductMediaPayloadSchema,
  setProductChannelsPayloadSchema,
  setProductVatPayloadSchema,
  type SetProductMediaPayload,
  type SetProductChannelsPayload,
  type SetProductVatPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveProductCommand } from "../application/archive-product.js";
import { CreateProductCommand } from "../application/create-product.js";
import { DeclareProductNutritionCommand } from "../application/declare-product-nutrition.js";
import { GetProductDetailQuery } from "../application/get-product-detail.js";
import { ListProductsQuery } from "../application/list-products.js";
import { PublishProductCommand } from "../application/publish-product.js";
import { RestoreProductCommand } from "../application/restore-product.js";
import { UnpublishProductCommand } from "../application/unpublish-product.js";
import { SetProductMediaCommand } from "../application/set-product-media.js";
import { SetProductChannelsCommand } from "../application/set-product-channels.js";
import { SetProductVatCommand } from "../application/set-product-vat.js";
import { UpdateProductEditorialCommand } from "../application/update-product-editorial.js";
import { UpdateProductIdentityCommand } from "../application/update-product-identity.js";
import { UpdateVariantPricingCommand } from "../application/update-variant-pricing.js";

/**
 * Produits du catalogue — dispatchés sur les bus CQRS. L'édition se fait **par
 * section** (une requête par section, pas par champ).
 *
 * Surface staff murée par `@AdminSurface("catalog")` : identité vérifiée
 * contre l'annuaire, puis périmètre. Elle a été **ouverte** tant que le
 * référentiel vivait dans son propre processus — un jeton Auth0 valide
 * suffisait, et un révoqué gardait la main sur le catalogue.
 */
@AdminSurface("catalog")
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

  /**
   * Section **Visuels** : la liste entière, dans son ordre.
   *
   * Un `PUT` de remplacement, comme les autres sections — l'écran envoie ce
   * qu'il affiche. Ce panneau n'avait AUCUNE route : on pouvait attacher des
   * images à la création et plus jamais y toucher.
   */
  @Put(":id/media")
  async setProductMedia(
    @Param("id") id: string,
    @Body(new ZodBody(setProductMediaPayloadSchema)) body: SetProductMediaPayload,
  ) {
    await this.commands.execute<SetProductMediaCommand, void>(
      new SetProductMediaCommand(id, body.media),
    );
    return { id };
  }

  /**
   * Section **Canaux** : où cette fiche se vend, quand elle ne suit pas sa
   * famille. `null` la rend à sa famille.
   */
  @Put(":id/channels")
  async setProductChannels(
    @Param("id") id: string,
    @Body(new ZodBody(setProductChannelsPayloadSchema)) body: SetProductChannelsPayload,
  ) {
    await this.commands.execute<SetProductChannelsCommand, void>(
      new SetProductChannelsCommand(id, body.channels),
    );
    return { id };
  }

  /**
   * Section **Tarif & TVA** : la dérogation de la fiche au taux de sa famille.
   *
   * Un `PUT` de remplacement comme les autres sections — l'écran envoie ce qu'il
   * affiche, carte vide comprise, et la carte vide est le retour à l'héritage.
   */
  @Put(":id/vat")
  async setProductTva(
    @Param("id") id: string,
    @Body(new ZodBody(setProductVatPayloadSchema)) body: SetProductVatPayload,
  ) {
    await this.commands.execute<SetProductVatCommand, void>(
      new SetProductVatCommand(id, body.tvaByContext),
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

  /**
   * Mise en vente. Refusée (409) si une déclinaison active n'a pas de fiche
   * réglementaire, ou si le produit est archivé — c'est l'agrégat qui tranche.
   */
  @Put(":id/publish")
  async publishProduct(@Param("id") id: string) {
    await this.commands.execute<PublishProductCommand, void>(new PublishProductCommand(id));
    return { id };
  }

  /** Retrait de la vente : le produit redevient brouillon, pas archivé. */
  @Put(":id/unpublish")
  async unpublishProduct(@Param("id") id: string) {
    await this.commands.execute<UnpublishProductCommand, void>(new UnpublishProductCommand(id));
    return { id };
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
