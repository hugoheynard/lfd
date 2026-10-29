import type { SaleReferenceUse } from "../../../catalogue/product/domain/value-objects/sale-reference-usage.js";

export type { SaleReferenceUse };

/**
 * **Une déclinaison, telle que le commerce en déduit la référence de vente.**
 *
 * Le référentiel ne calcule PAS la référence : c'est `shopSkuOf`, côté
 * commerce, qui la décide (le défaut sous le SKU de sa fiche, une autre
 * déclinaison sous le sien). Un plan voisin fera vendre le défaut sous son
 * propre SKU ; la règle changera alors en un seul endroit.
 */
export interface SaleReferenceQuery {
  /** Le SKU de la déclinaison — la clé de la réponse. */
  readonly sku: string;
  readonly productSku: string;
  readonly isDefault: boolean;
}

/**
 * **« Cette référence a-t-elle déjà servi ? »** — un port que le référentiel
 * DÉCLARE et que le commerce implémente (`appBootstrap/` les relie), sur le
 * modèle de `GeneralOrderCutoffReader`.
 *
 * Il fige l'unité de vente d'une déclinaison dès sa première utilisation
 * (`documentation/pricing/plan-changer-l-unite-de-vente.md`, § 8) : commande
 * de tout statut, brouillon, panier gardé, abonnement, réassort, lot, gabarit,
 * décision tarifaire en vigueur ou close. `pim → b2b` est interdit : le
 * référentiel demande, il ne va pas lire.
 *
 * Une lecture PAR LOT : le détail d'une fiche la pose pour toutes ses
 * déclinaisons d'un coup. Une déclinaison sans usage est présente avec une
 * liste vide. Une panne REJETTE la promesse — l'appelant refuse alors le
 * changement, il ne le tient jamais pour accordé.
 */
export abstract class SaleReferenceUsage {
  abstract usesOf(
    references: readonly SaleReferenceQuery[],
  ): Promise<ReadonlyMap<string, readonly SaleReferenceUse[]>>;
}
