import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injectable, PLATFORM_ID } from '@angular/core';

import { ClientCart } from '../cart/client-cart.service';
import { ShopCatalogue } from './shop-catalogue.store';

/**
 * **Le rayon relu au retour sur l'onglet, panier vide** (lot C4,
 * `documentation/pricing/moteur/plan-cache-du-catalogue.md` — Hugo,
 * 2026-11-04, option b).
 *
 * Le rayon est une photo qui ne se rafraîchit pas sous un client en train de
 * choisir (`ShopCatalogue`). Ce service n'y fait qu'une exception : l'onglet
 * redevient visible ET le panier est vide — personne ne compose, rien ne bouge
 * sous ses yeux. Le panier, lui, recalcule toujours au vrai prix.
 *
 * Il vit hors de `ShopCatalogue` parce que le panier dépend déjà du catalogue :
 * le catalogue qui lirait le panier ferait un cycle.
 */
@Injectable({ providedIn: 'root' })
export class ShelfRefreshOnReturn {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private readonly cart = inject(ClientCart);
  private readonly catalogue = inject(ShopCatalogue);

  /** Branche l'écoute, une fois, au démarrage. Rien côté serveur. */
  listen(): void {
    if (!this.browser) {
      return;
    }
    const onChange = (): void => {
      this.onVisibilityChange();
    };
    this.document.addEventListener('visibilitychange', onChange);
    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onChange);
    });
  }

  /** Visible et panier vide : la photo se relit si elle a vieilli. */
  onVisibilityChange(): void {
    if (this.document.visibilityState !== 'visible' || !this.cart.isEmpty()) {
      return;
    }
    void this.catalogue.refreshIfStale();
  }
}
