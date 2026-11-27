import { Injectable } from "@nestjs/common";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { ReceivedCatalogItem } from "../../domain/catalog-product-facts.js";
import { ReservationChangedEvent } from "../../domain/events/made-to-order.events.js";
import { CatalogReservations } from "../../domain/ports/catalog-reservations.js";
import { ReservationCompanies } from "../../domain/ports/reservation-companies.js";

/**
 * **Un article qui cesse d'être sur mesure perd ses comptes attribués**
 * (`documentation/catalogue/plan-fin-du-sur-mesure.md`, D4).
 *
 * Seul le sur mesure s'attribue ; la fiche reçue est la seule à dire qu'un
 * article ne l'est plus. Appelé par l'abonné de la fiche, dans sa
 * transaction, AVANT que l'article ne soit écrit `custom_recipe = false` :
 * dans l'ordre inverse, la clé `(sku, custom_recipe)` refuserait l'écriture.
 *
 * Ne retire que pour un `customRecipe === false` reçu : un fait d'avant le
 * champ ne dit rien, et ne retire donc rien.
 */
@Injectable()
export class OrdinaryArticleReleases {
  constructor(
    private readonly reservations: CatalogReservations,
    private readonly companies: ReservationCompanies,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * @param deliveryId l'événement livré, qui rend chaque fait idempotent au
   *   rejeu — un fait par compte retiré.
   */
  async release(items: readonly ReceivedCatalogItem[], deliveryId: string): Promise<void> {
    const ordinary = items.filter((item) => item.customRecipe === false);
    const released = await this.reservations.releaseAllOf(ordinary.map((item) => item.sku));
    if (released.length === 0) {
      return;
    }
    const names = await this.companies.namesOf([...new Set(released.map((row) => row.companyId))]);
    const nameOf = new Map(ordinary.map((item) => [item.sku, item.name]));
    await this.events.publishTracedAll(
      released.map(
        (row) =>
          new ReservationChangedEvent(
            { sku: row.sku, name: nameOf.get(row.sku) ?? row.sku },
            { companyId: row.companyId, companyName: names.get(row.companyId) ?? null },
            false,
            `catalog_item.reservation_released:${deliveryId}:${row.sku}:${row.companyId}`,
          ),
      ),
    );
  }
}
