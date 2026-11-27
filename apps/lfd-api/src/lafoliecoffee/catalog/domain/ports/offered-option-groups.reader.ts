import type { ShopAudience } from "./catalog.reader.js";
import type { OfferedOptionGroup } from "../option-groups/catalog-option-groups.js";

/**
 * **Les groupes d'options proposés à une clientèle, par SKU** (lot G2 de
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.2) — la lecture
 * que le catalogue publie pour la commande, qui ne lit pas sa table.
 *
 * Filtrés par l'audience que l'APPELANT a résolue côté serveur, jamais par
 * un paramètre du client. Un SKU sans groupe proposé est ABSENT de la table
 * rendue. Une seule lecture par appel, quelle que soit la taille du panier.
 */
export abstract class OfferedOptionGroupsReader {
  abstract offeredFor(
    skus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, readonly OfferedOptionGroup[]>>;
}
