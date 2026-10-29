import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { UuidGenerator } from "../../../../platform/id/uuid-generator.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { Product } from "../domain/entities/product.js";
import { EditorialReader } from "../domain/ports/editorial-reader.js";
import { EditorialRepository } from "../domain/ports/editorial.repository.js";
import { NutritionValuesRepository } from "../domain/ports/nutrition-values.repository.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { VariantAllergensRepository } from "../domain/ports/variant-allergens.repository.js";
import {
  proposeProductSku,
  proposeSku,
  variantSkuRoot,
  type SkuAvailability,
} from "../domain/services/sku-generator.js";
import { SKU_AVAILABILITY } from "../infrastructure/prisma-sku-availability.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";
import { copiedEditorial, copiedMedia, copiedNutrition } from "./detached-product-copy.js";
import { announceProductMedia } from "./product-media-announcement.js";
import { requireProduct, variantSnapshotOf } from "./product-support.js";

export class DetachProductVariantCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
  ) {}
}

/**
 * **Fait d'une déclinaison un produit** (`plan-gestes-de-declinaison.md`, G2).
 *
 * Nouvel id, nouvelle référence produit tirée comme à la création, nouvel
 * article `<SKU>-1` ; tout ce que la déclinaison voyait est copié en propre
 * (D3 — c'est l'agrégat qui résout), et l'origine l'archive. Le tout dans
 * **une** unité de travail : un produit né sans que l'origine ait archivé
 * vendrait deux fois le même article.
 *
 * ⚠️ Les tarifs négociés et mercuriales posés sur l'ancien SKU ne suivent
 * pas (D2) — et ne sont PAS listés : aucun canal ne permet au référentiel de
 * les lire (vérifié le 2026-10-29, `pim → b2b` interdit, aucun lecteur
 * déclaré dans `pim/channels/b2b-platform/`).
 *
 * @returns l'id du nouveau produit — l'écran l'ouvre.
 */
@CommandHandler(DetachProductVariantCommand)
export class DetachProductVariantHandler implements ICommandHandler<
  DetachProductVariantCommand,
  string
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly allergenSheets: VariantAllergensRepository,
    private readonly nutritionValues: NutritionValuesRepository,
    private readonly editorialReader: EditorialReader,
    private readonly editorials: EditorialRepository,
    private readonly journal: PimJournal,
    private readonly durable: DurablePublisher,
    private readonly uow: UnitOfWork,
    @Inject(UuidGenerator) private readonly ids: UuidGenerator,
    @Inject(SKU_AVAILABILITY) private readonly availability: SkuAvailability,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: DetachProductVariantCommand): Promise<string> {
    const origin = await requireProduct(this.products, command.productId);
    const sku = await proposeProductSku(() => this.ids.next(), this.availability);
    const variantSku = await proposeSku(variantSkuRoot(sku, 0), this.availability);
    const born = origin.detachVariant(command.variantId, {
      id: this.ids.next(),
      sku,
      defaultVariant: { id: this.ids.next(), sku: variantSku },
    });

    await this.uow.run(async () => {
      await this.writeBorn(born, origin, command.variantId);
      await this.writeOrigin(origin, born, command.variantId);
      await this.emitter.emitProducts([origin.id, born.id]);
    });
    return born.id;
  }

  /** Le nouveau produit, sa fiche réglementaire, ses textes et ses visuels. */
  private async writeBorn(born: Product, origin: Product, variantId: string): Promise<void> {
    const snapshot = born.persistenceSnapshot();
    const variant = snapshot.variants[0];
    const ticket = await this.journal.trace({
      type: PIM_EVENTS.productCreatedFromVariant,
      subjectType: "product",
      subjectId: born.id,
      payload: {
        subjectLabel: snapshot.name.fr,
        sku: born.sku,
        name: snapshot.name,
        origin: { id: origin.id, name: origin.snapshot().name.fr },
        originVariantSku: variantSnapshotOf(origin.snapshot(), variantId).sku,
      },
    });
    // `add` réserve les deux références et ouvre le défaut nu ; `save` y écrit
    // ce qu'il a hérité (tarif, unité, minimum, TVA).
    await this.products.add(born, ticket);
    await this.products.save(born, ticket);
    if (variant?.allergenSheet != null) {
      const { declared, mayContain } = variant.allergenSheet;
      await this.allergenSheets.save(variant.id, { allergens: declared, mayContain }, ticket);
    }
    if (variant?.nutrition != null) {
      await this.nutritionValues.save(variant.id, copiedNutrition(variant.nutrition), ticket);
    }
    await this.copyEditorial(origin.id, born.id, ticket);
  }

  private async copyEditorial(originId: string, bornId: string, ticket: WriteTicket) {
    const [story, media] = await Promise.all([
      this.editorialReader.findByProduct(originId),
      this.editorialReader.mediaOf(originId),
    ]);
    const visuals = copiedMedia(media);
    if (story === null && visuals.length === 0) {
      return;
    }
    await this.editorials.save(bornId, copiedEditorial(story), visuals, ticket);
    if (visuals.length > 0) {
      await announceProductMedia(
        { readers: this.editorialReader, durable: this.durable, ids: this.ids },
        bornId,
      );
    }
  }

  /** L'origine : la déclinaison archivée, et le produit qu'elle est devenue. */
  private async writeOrigin(origin: Product, born: Product, variantId: string): Promise<void> {
    const snapshot = origin.snapshot();
    const variant = variantSnapshotOf(snapshot, variantId);
    const ticket = await this.journal.trace({
      type: PIM_EVENTS.productVariantDetached,
      subjectType: "product",
      subjectId: origin.id,
      payload: {
        subjectLabel: snapshot.name.fr,
        variant: { id: variant.id, name: variant.name.fr },
        sku: variant.sku,
        product: { id: born.id, name: born.snapshot().name.fr },
        productSku: born.sku,
      },
    });
    await this.products.save(origin, ticket);
  }
}
