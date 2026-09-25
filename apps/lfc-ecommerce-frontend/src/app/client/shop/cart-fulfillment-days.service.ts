import { computed, effect, inject, Injectable, untracked } from '@angular/core';

import { CartStore } from '../cart/cart.store';
import { ClientAudience } from '../client-audience.service';
import { ServicePoints } from './pickup-points.store';
import { ShopCatalogue } from './shop-catalogue.store';

/**
 * **Les jours proposés suivent le panier** (D6 de
 * `documentation/order/architecture-operations-datees.md`).
 *
 * Un panier qui porte un article réservé à une opération ne se voit proposer
 * que les jours de retrait de celle-ci : `GET /fulfillment-days` le sait dès
 * qu'on lui passe les SKU et la clientèle. Ce service les lui passe.
 *
 * Seuls les articles d'opération y entrent. Le serveur ne borne qu'eux, et y
 * mettre tout le panier relirait les jours à chaque croissant ajouté pour la
 * même réponse. La clientèle est celle de la vitrine : `pro` pour une
 * société, `public` sinon. Il pose aussi le dernier jour proposable
 * ({@link ServicePoints.lastDay}) : la première journée vient du serveur, les
 * suivantes sont des onglets que rien d'autre ne bornerait.
 *
 * À part de {@link ServicePoints} parce que ses lecteurs ne veulent pas tous
 * un panier : l'y injecter chargeait catalogue et espace chez un écran de
 * réglages qui ne demande que des points de retrait.
 */
@Injectable({ providedIn: 'root' })
export class CartFulfillmentDays {
  private readonly points = inject(ServicePoints);
  private readonly cart = inject(CartStore);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly audience = inject(ClientAudience);

  private readonly operationItems = computed(() => {
    const quantities = this.cart.quantities();
    return this.catalogue
      .items()
      .filter((item) => item.operation !== undefined && (quantities[item.sku] ?? 0) > 0);
  });

  private readonly operationSkus = computed(() => this.operationItems().map((item) => item.sku), {
    equal: (a, b) => a.join(',') === b.join(','),
  });

  /**
   * Le plus petit dernier jour de retrait des opérations du panier — lu dans
   * `ShopCatalogueView.operations`. Une opération que le catalogue ne sert plus
   * ne borne rien ici : le serveur, lui, la refusera en le disant.
   */
  private readonly lastDay = computed(() => {
    const days = this.operationItems().flatMap((item) => {
      const key = item.operation?.key;
      const operation = key === undefined ? null : this.catalogue.operationOf(key);
      return operation === null ? [] : [operation.pickupUntil];
    });
    // Des jours `AAAA-MM-JJ` se comparent comme des chaînes.
    return days.length === 0 ? null : days.reduce((a, b) => (b < a ? b : a));
  });

  constructor() {
    effect(() => {
      const skus = this.operationSkus();
      const audience = this.audience.shown() === 'b2b' ? 'pro' : 'public';
      untracked(() => {
        this.points.scopeDaysTo(skus, audience);
      });
    });
    effect(() => {
      const lastDay = this.lastDay();
      untracked(() => {
        this.points.capDaysAt(lastDay);
      });
    });
  }
}
