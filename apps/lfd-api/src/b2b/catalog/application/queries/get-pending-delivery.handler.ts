import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { CatalogSnapshot } from "@lfd/catalog-sync";
import type { DeliveryChangeView, PendingDeliveryView } from "@lfd/contracts";

import {
  carriesAllergenChange,
  diffDelivery,
  type DeliveredItem,
} from "../../domain/delivery-diff.js";
import { CatalogDeliveryRepository } from "../../domain/ports/catalog-delivery.repository.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { GetPendingDeliveryQuery } from "./get-pending-delivery.query.js";

/** Le snapshot livré, aplati en articles comparables. */
function deliveredItems(snapshot: CatalogSnapshot): DeliveredItem[] {
  return snapshot.products.flatMap((product) =>
    product.variants.map((variant) => ({
      sku: variant.sku,
      name: variant.name,
      priceMillicents: variant.priceMillicents,
      vatRatePercent: variant.vatRatePercent,
      weightGrams: variant.weightGrams,
      categoryId: product.categoryId,
      allergens: variant.allergens,
    })),
  );
}

/**
 * **Ce qui attend, et ce que ça changerait.**
 *
 * Le diff est calculé à la LECTURE, pas figé à la réception. C'est délibéré :
 * le miroir bouge entre-temps — un commercial masque un article, un prix se
 * négocie — et un diff figé montrerait un écart qui n'existe plus. Ce que le
 * relecteur doit voir, c'est ce que la validation ferait **maintenant**.
 *
 * Le coût est une comparaison par affichage, sur deux cents articles. Le gain
 * est qu'on ne valide jamais contre une photographie périmée.
 */
@QueryHandler(GetPendingDeliveryQuery)
export class GetPendingDeliveryHandler implements IQueryHandler<
  GetPendingDeliveryQuery,
  PendingDeliveryView | null
> {
  constructor(
    private readonly deliveries: CatalogDeliveryRepository,
    private readonly items: CatalogItemRepository,
  ) {}

  async execute(): Promise<PendingDeliveryView | null> {
    const delivery = await this.deliveries.pending();
    if (delivery === null) {
      // Rien à valider est l'état NORMAL, pas une erreur : la route rend `null`
      // et l'écran le dit sereinement.
      return null;
    }

    const incoming = deliveredItems(delivery.snapshot);
    const mirror = (await this.items.loadAll()).map((item) => ({
      sku: item.sku,
      name: item.name,
      // Le prix REÇU, jamais l'effectif : une négociation locale n'est pas une
      // dérive du référentiel, et la signaler ferait sonner l'écran sur chaque
      // client à qui l'on a consenti un tarif.
      priceMillicents: item.pimPriceMillicents,
      vatRatePercent: item.vatRatePercent,
      weightGrams: item.weightGrams,
      categoryId: item.categoryId,
      allergens: item.allergens,
    }));

    const changes = diffDelivery(incoming, mirror);
    const nameBySku = new Map(
      [...incoming, ...mirror].map((item) => [item.sku, item.name] as const),
    );

    return {
      id: delivery.id,
      revisionId: delivery.revisionId,
      receivedAt: delivery.receivedAt.toISOString(),
      changes: changes.map((change): DeliveryChangeView => ({
        sku: change.sku,
        kind: change.kind,
        fields: [...change.fields],
        name: nameBySku.get(change.sku) ?? null,
      })),
      carriesAllergenChange: carriesAllergenChange(changes),
    };
  }
}
