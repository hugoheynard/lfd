import type { CommerceOperationView } from "@lfd/contracts";

import type { OperationImageLibrary } from "../../channels/media/operation-image-library.js";
import type { OperationSnapshot } from "../../domain/entities/operation.js";
import { OperationsNotAtCommerceError } from "../../domain/errors/operation-errors.js";
import type { OperationSaleReader } from "../../domain/ports/operation-sale.reader.js";
import type { OperationWritingSwitch } from "../../domain/ports/operation-writing-switch.js";
import { shopDisplayOf } from "../../domain/services/operation-shop-display.js";
import { scheduleText } from "../commands/operation-writing.js";

/**
 * Ce que les deux lectures de l'écran partagent : la porte, et la
 * traduction d'une opération en vue.
 */

/**
 * L'écran lit au commerce seulement une fois les opérations au commerce :
 * avant, la table est une copie que le push réécrit, et l'écran mentirait.
 *
 * @throws {OperationsNotAtCommerceError} `OPERATIONS_AT_COMMERCE` est fermé.
 */
export function ensureReadingOpen(writing: OperationWritingSwitch): void {
  if (!writing.isOpen()) {
    throw new OperationsNotAtCommerceError();
  }
}

/** Ce que la vue lit autour de l'opération : la médiathèque, le catalogue, l'heure. */
export interface ViewSources {
  readonly library: OperationImageLibrary;
  readonly sale: OperationSaleReader;
  readonly now: Date;
}

/**
 * Les vues de ces opérations — une lecture de la médiathèque et une du
 * catalogue pour toutes, quel qu'en soit le nombre.
 */
export async function operationViews(
  operations: readonly OperationSnapshot[],
  sources: ViewSources,
): Promise<CommerceOperationView[]> {
  const urls = operations.flatMap((operation) =>
    operation.image === null ? [] : [operation.image.url],
  );
  const [described, selling] = await Promise.all([
    sources.library.describeMany(urls),
    sources.sale.sellingAmong([...new Set(operations.flatMap((operation) => operation.skus))]),
  ]);
  return operations.map((operation) => {
    const sellingSkus = operation.skus.filter((sku) => selling.has(sku));
    const state = operation.schedule.stateAt(sources.now);
    const shop = shopDisplayOf({
      hidden: operation.hidden,
      archived: operation.archivedAt !== null,
      state,
      sellingCount: sellingSkus.length,
    });
    return {
      key: operation.key,
      name: operation.name,
      lede: operation.lede,
      image:
        operation.image === null
          ? null
          : {
              url: operation.image.url,
              alt: described.get(operation.image.url)?.alt ?? "",
              focal: operation.image.focal,
            },
      ...scheduleText(operation.schedule),
      audience: operation.audience,
      skus: [...operation.skus],
      sellingSkus,
      withoutSellingArticle: sellingSkus.length === 0,
      hidden: operation.hidden,
      archivedAt: operation.archivedAt === null ? null : operation.archivedAt.toISOString(),
      state,
      shopDisplay: shop.display,
      awaitingProducts: shop.awaitingProducts,
      heldAtCommerce: operation.lastWrite !== null,
      lastWrite:
        operation.lastWrite === null
          ? null
          : { by: operation.lastWrite.by, at: operation.lastWrite.at.toISOString() },
    };
  });
}
