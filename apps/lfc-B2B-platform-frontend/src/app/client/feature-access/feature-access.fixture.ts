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
  access.receive({ shop: level, ...DEFAULT_SURFACES });
  return access;
}

/**
 * Toutes les clés sauf la boutique, à leur défaut du catalogue.
 *
 * S'appelait `ALL_VISIBLE` jusqu'au 2026-09-14 : le mandat client y est entré
 * FERMÉ (`closed`), et le nom aurait menti.
 */
export const DEFAULT_SURFACES = {
  orders: 'visible',
  invoices: 'visible',
  desktopMenu: 'visible',
  customerMandate: 'closed',
} as const;
