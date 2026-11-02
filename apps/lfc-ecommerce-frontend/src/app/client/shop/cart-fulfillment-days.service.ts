import { computed, effect, inject, Injectable, untracked } from '@angular/core';

import { CartStore } from '../cart/cart.store';
import { ClientAudience } from '../client-audience.service';
import { OrderAdmissionStore } from './order-admission.store';
import { OrderOpeningStore } from './order-opening.store';
import { ServicePoints } from './pickup-points.store';
import { ShopCatalogue } from './shop-catalogue.store';
import { isLocked } from './locked-item';

/**
 * **Les jours proposés suivent le panier** (D6 de
 * `documentation/operations-datees/architecture-operations-datees.md`).
 *
 * Un panier qui porte un article réservé à une opération ne se voit proposer
 * que les jours de retrait de celle-ci : `GET /fulfillment-days` le sait dès
 * qu'on lui passe les SKU et la clientèle. Ce service les lui passe.
 *
 * Tout le panier y entre depuis le lot L7 du circuit du jour J : le serveur
 * juge aussi le reste en vitrine pour « aujourd'hui ». La clientèle part
 * TOUJOURS, panier vide compris — `pro` pour une société, `public` sinon :
 * sans elle, le serveur répondait pour le public, et un pro se voyait
 * proposer (ou refuser) aujourd'hui selon le réglage d'une autre clientèle. Il pose aussi le dernier jour proposable
 * ({@link ServicePoints.lastDay}) : la première journée vient du serveur, les
 * suivantes sont des onglets que rien d'autre ne bornerait.
 *
 * Il pose enfin le premier jour commandable de qui regarde
 * ({@link ServicePoints.floorDaysAt}, lot J4 du plan
 * `plan-premier-jour-commandable.md`) : rien ne se propose avant.
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
  private readonly admission = inject(OrderAdmissionStore);
  private readonly opening = inject(OrderOpeningStore);

  private readonly operationItems = computed(() => {
    const quantities = this.cart.quantities();
    return this.catalogue
      .items()
      .filter(
        (item) =>
          item.operation !== undefined && (quantities[item.sku] ?? 0) > 0 && !isLocked(item),
      );
  });

  private readonly operationScoped = computed(() => this.operationItems().length > 0);

  /**
   * TOUS les SKU du panier, triés — pas seulement ceux d'opération, depuis le
   * lot L7 du circuit du jour J (`jour-meme-sur-stock.md`) : le
   * serveur ne propose aujourd'hui à un point que si sa vitrine a un reste
   * pour TOUT le panier ; un panier mixte se voit proposer demain. La relecture
   * suit l'ENSEMBLE des articles, jamais leurs quantités : un croissant de plus
   * ne relit rien, un article neuf si.
   */
  private readonly cartSkus = computed(
    () => {
      const quantities = this.cart.quantities();
      return Object.keys(quantities)
        .filter((sku) => (quantities[sku] ?? 0) > 0)
        .sort();
    },
    { equal: (a, b) => a.join(',') === b.join(',') },
  );

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
    // Le réglage porte la date de la clientèle : sans lui, rien ne la borne.
    void this.opening.hydrate();
    effect(() => {
      const skus = this.cartSkus();
      const scoped = this.operationScoped();
      const audience = this.audience.shown() === 'b2b' ? 'pro' : 'public';
      untracked(() => {
        this.points.scopeDaysTo(skus, scoped, audience);
      });
    });
    effect(() => {
      const lastDay = this.lastDay();
      untracked(() => {
        this.points.capDaysAt(lastDay);
      });
    });
    effect(() => {
      const firstDay = this.admission.firstServiceDay();
      untracked(() => {
        this.points.floorDaysAt(firstDay);
      });
    });
  }
}
