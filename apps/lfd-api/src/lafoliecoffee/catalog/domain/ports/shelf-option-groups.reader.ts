import type { ShopAudience } from "./catalog.reader.js";
import type { OfferedOptionGroup } from "../option-groups/catalog-option-groups.js";

/**
 * **Tous les groupes d'options qu'une clientèle se voit proposer**, par SKU —
 * ce que les écrans montrent à côté du rayon pour qu'on choisisse « dont 2
 * tranchés » (`documentation/catalogue/plan-options-de-commande.md`, § 3.3).
 *
 * Un port à part de {@link OfferedOptionGroupsReader} : la commande ne juge
 * que les SKU qu'on lui demande, l'écran veut tout le rayon d'un coup. Filtré
 * par l'audience que l'appelant a résolue côté serveur ; un SKU sans groupe
 * proposé est ABSENT de la table rendue. Une seule lecture.
 */
export abstract class ShelfOptionGroupsReader {
  abstract offeredTo(
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, readonly OfferedOptionGroup[]>>;
}
