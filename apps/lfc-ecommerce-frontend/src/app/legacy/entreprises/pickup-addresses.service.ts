import { computed, inject, Injectable } from '@angular/core';
import type { PickupAddressView } from '@lfd/contracts';
// Par le sous-chemin sans zod, comme le reste de la boutique (budget `cloudflare`).
import { preselectedPickupId } from '@lfd/contracts/shop-values';

import { ServicePoints } from '../../client/shop/pickup-points.store';

/**
 * Points de retrait côté **client**, pour les écrans hérités — lecture seule.
 *
 * Ils lisent désormais la liste de `ServicePoints` : filtrée AU SERVEUR par la
 * clientèle de qui regarde, et relue au changement d'espace (Hugo,
 * 2026-10-15). Il n'y a plus de point « par défaut » : on n'en garde que le
 * point qui s'impose — le seul ouvert (`preselectedPickupId`) —, sinon `null`
 * et l'écran fait choisir. En cas d'échec réseau, la liste reste vide.
 */
@Injectable({ providedIn: 'root' })
export class PickupAddressesService {
  private readonly points = inject(ServicePoints);

  /** Les points proposés (lecture seule) — pour proposer un choix. */
  readonly addresses = this.points.pickups;

  /** Le point qui s'impose sans choix — le seul ouvert —, ou `null`. */
  readonly preselectedPickup = computed<PickupAddressView | null>(() => {
    const points = this.addresses();
    const id = preselectedPickupId(points, null);
    return points.find((point) => point.id === id) ?? null;
  });

  constructor() {
    void this.points.hydrate();
  }
}
