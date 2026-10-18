import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import type { ProductAudienceEvent } from '@lfd/contracts/shop-values';

import type { AudienceOrigin } from './product-audience-queue';

/**
 * **La mesure d'audience anonyme** — vue d'une fiche, ajout au panier
 * (R5 bis de `documentation/recommandation-produit/plan-recommandation-de-produits.md`).
 *
 * Rien en SSR, rien de bloquant, et rien qui désigne le visiteur : un SKU et
 * un geste. La file et l'envoi vivent dans un morceau chargé à la demande
 * ({@link ProductAudienceQueue}) — le paquet initial de la boutique est à son
 * plafond, ce service n'y met que la porte.
 */
@Injectable({ providedIn: 'root' })
export class ProductAudience {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly http = inject(HttpClient);

  /** `origin` : la source et l'emplacement d'un geste de suggestion ; absent = direct. */
  record(sku: string, event: ProductAudienceEvent, origin: AudienceOrigin | null = null): void {
    if (this.browser) {
      void import('./product-audience-queue').then((m) =>
        m.sharedAudienceQueue(this.http).record(sku, event, origin),
      );
    }
  }
}
