import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct, variantSnapshotOf } from "./product-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";

export class RestoreProductVariantCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
  ) {}
}

/**
 * **Désarchive une déclinaison** (`plan-gestes-de-declinaison.md`, ajout du
 * 2026-10-29) : elle reprend son rang et sa référence, et revient en vente
 * selon l'état de la fiche — l'émission au catalogue la remet dans les faits.
 *
 * Le refus d'une déclinaison devenue un produit est celui de l'agrégat ; le
 * handler ne fait que lui donner le nom de ce produit, pour que le message le
 * dise.
 */
@CommandHandler(RestoreProductVariantCommand)
export class RestoreProductVariantHandler implements ICommandHandler<
  RestoreProductVariantCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: RestoreProductVariantCommand): Promise<void> {
    const { productId, variantId } = command;
    const product = await requireProduct(this.products, productId);
    product.restoreVariant(variantId, await this.detachedLabel(product, variantId));
    const snapshot = product.snapshot();
    const variant = variantSnapshotOf(snapshot, variantId);

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productVariantRestored,
        subjectType: "product",
        subjectId: productId,
        payload: {
          subjectLabel: snapshot.name.fr,
          variant: { id: variantId, name: variant.name.fr },
          sku: variant.sku,
        },
      });
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([productId]);
    });
  }

  /** « P-XXXXXX — Nom » du produit qu'elle est devenue, s'il y en a un. */
  private async detachedLabel(product: Product, variantId: string): Promise<string | undefined> {
    const detachedId = product.detachedProductOf(variantId);
    if (detachedId === null) {
      return undefined;
    }
    const detached = await this.products.findById(detachedId);
    return detached === null ? undefined : `${detached.sku} — ${detached.snapshot().name.fr}`;
  }
}
