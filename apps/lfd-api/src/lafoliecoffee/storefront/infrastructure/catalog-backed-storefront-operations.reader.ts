import { Injectable } from "@nestjs/common";

import {
  opensAt,
  operationStateAt,
  reachesAudience,
} from "../../catalog/domain/operation-access.js";
import { CatalogOperationsReader } from "../../catalog/domain/ports/catalog-operations.reader.js";
import {
  StorefrontOperationsReader,
  type ShownOperation,
  type StorefrontAudience,
} from "../domain/storefront-operations.reader.js";

/**
 * Adaptateur du port de la vitrine sur `CatalogOperationsReader` — la lecture
 * que les vendeurs appliquent déjà (opérations tenues, surcharge combinée).
 * La fenêtre et la clientèle se tranchent par les fonctions du catalogue, les
 * mêmes que le rayon `op:<key>` (`shop-catalogue-operations.ts`).
 *
 * Un rayon dont les
 * articles ne sont plus en vente (dépubliés) n'est PAS détecté ici — il
 * faudrait relire tout le catalogue sur la route anonyme.
 *
 * La règle suit celle du rayon : une sélection vide ne cache pas l'annonce
 * pendant l'annonce ni commandes ouvertes — le rayon s'ouvre alors sur son
 * encart (plan, « Une opération sans article ») ; commandes closes, elle
 * s'efface.
 */
@Injectable()
export class CatalogBackedStorefrontOperationsReader extends StorefrontOperationsReader {
  constructor(private readonly operations: CatalogOperationsReader) {
    super();
  }

  async shownTo(
    audience: StorefrontAudience,
    now: Date,
  ): Promise<ReadonlyMap<string, ShownOperation>> {
    const shown = new Map<string, ShownOperation>();
    for (const operation of await this.operations.sellableOperations()) {
      const state = operationStateAt(operation, now);
      if (state === null || !reachesAudience(operation, audience)) {
        continue;
      }
      if (operation.skus.length === 0 && state === "closed") {
        continue;
      }
      shown.set(operation.key, {
        key: operation.key,
        name: operation.name,
        lede: operation.lede,
        image: operation.image,
        state,
        orderFrom: opensAt(operation),
        orderUntil: operation.orderUntil,
        pickupFrom: operation.pickupFrom,
        pickupUntil: operation.pickupUntil,
      });
    }
    return shown;
  }
}
