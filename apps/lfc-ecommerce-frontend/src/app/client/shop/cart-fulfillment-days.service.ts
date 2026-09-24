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
 * société, `public` sinon.
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

  private readonly operationSkus = computed(
    () => {
      const quantities = this.cart.quantities();
      return this.catalogue
        .items()
        .filter((item) => item.operation !== undefined && (quantities[item.sku] ?? 0) > 0)
        .map((item) => item.sku);
    },
    { equal: (a, b) => a.join(',') === b.join(',') },
  );

  constructor() {
    effect(() => {
      const skus = this.operationSkus();
      const audience = this.audience.shown() === 'b2b' ? 'pro' : 'public';
      untracked(() => {
        this.points.scopeDaysTo(skus, audience);
      });
    });
  }
}
