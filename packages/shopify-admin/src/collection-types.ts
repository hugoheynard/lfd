/**
 * Vocabulaire **partagé** des collections Shopify : ce que le client Admin
 * lit/écrit et ce que la réconciliation rapproche.
 */

/** Une collection Shopify, réduite à ce dont la réconciliation a besoin. */
export interface ShopifyCollection {
  readonly id: string;
  /** Handle = clé de rapprochement (`tva-5-5`). */
  readonly handle: string;
  readonly title: string;
  /** Fiches rattachées côté boutique — `0` = collection poussée vide. */
  readonly productCount: number;
}

/** Ce que le consommateur veut voir exister sur la boutique. */
export interface DesiredCollection {
  /** Handle attendu — le tag du régime (`tva-5-5`). */
  readonly handle: string;
  readonly title: string;
}

/** Préfixe qui marque une collection comme « gérée par la TVA ». */
export const TVA_HANDLE_PREFIX = "tva-";
