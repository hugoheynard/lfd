import { TestBed } from '@angular/core/testing';
import type { ShopLevel } from '@lfd/contracts';

import { ClientFeatureAccess } from './client-feature-access.service';

/**
 * **La boutique à tel niveau**, pour les suites qui dépendent de ce qu'elle permet.
 *
 * Pose la réponse du serveur sans passer par le réseau. À appeler AVANT
 * d'injecter ce qui la lit : le panier et le menu décident à leur construction
 * de ce qu'ils demandent.
 */
export function openShopAt(level: ShopLevel): ClientFeatureAccess {
  const access = TestBed.inject(ClientFeatureAccess);
  access.receive({ shop: level, ...ALL_VISIBLE });
  return access;
}

/** Les trois surfaces masquables, montrées : l'état par défaut du catalogue. */
export const ALL_VISIBLE = {
  orders: 'visible',
  invoices: 'visible',
  desktopMenu: 'visible',
} as const;
