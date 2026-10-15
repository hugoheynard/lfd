import type { CategoryNode, SyncOrderTimeLimitRule } from "@lfd/catalog-sync";

import type { OrderLimitChange, OrderLimitTarget } from "../order-limit-descent.js";

/**
 * **Ce que la descente des limites de commande lit et écrit sur la
 * plateforme** (lot 2b de `documentation/pim/plan-catalogue-synchronise-par-audience.md`).
 *
 * Une projection, pas un agrégat : la limite d'un article est un fait du
 * référentiel, résolu ici depuis ses règles, et aucune décision locale ne
 * peut la refuser. Toutes les méthodes suivent la transaction ambiante — celle
 * de la livraison du fait.
 */
export abstract class CatalogOrderLimits {
  /** L'échelle reçue du dernier fait de règles ; `null` = aucun fait reçu encore. */
  abstract rules(): Promise<readonly SyncOrderTimeLimitRule[] | null>;

  /** L'arbre des familles connues, pour remonter la lignée d'un article. */
  abstract categories(): Promise<readonly CategoryNode[]>;

  /** Les articles EN VENTE — d'une fiche, ou tous (`null`). */
  abstract targets(productId: string | null): Promise<readonly OrderLimitTarget[]>;

  /** Réécrit les seules colonnes de limite de ces articles. */
  abstract write(changes: readonly OrderLimitChange[]): Promise<void>;
}
