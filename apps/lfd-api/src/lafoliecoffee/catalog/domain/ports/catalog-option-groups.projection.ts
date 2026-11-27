import type { CatalogOptionGroup } from "../option-groups/catalog-option-groups.js";

/** Les groupes d'options d'un article, tels qu'un fait de sa fiche les apporte. */
export interface ReceivedOptionGroups {
  readonly sku: string;
  readonly groups: readonly CatalogOptionGroup[];
}

/**
 * **Ce que le fait d'une fiche écrit des groupes d'options** (lot G2 de
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.2).
 *
 * Un port à part de `CatalogProductFactsProjection` : la table est autre, et
 * aucun lecteur du rayon ne la lit. Il ne s'appelle qu'après
 * `recordEntryIfNewer`, donc derrière la condition `applied_seq` de la fiche,
 * dans la transaction de la livraison.
 */
export abstract class CatalogOptionGroupsProjection {
  /** Réécrit, pour chaque SKU reçu, ses groupes — `[]` compris : la fiche n'en active plus. */
  abstract record(
    productId: string,
    items: readonly ReceivedOptionGroups[],
    receivedAt: Date,
  ): Promise<void>;
}
