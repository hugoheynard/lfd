import type { ShopAudience } from "../ports/catalog.reader.js";
import { audienceIncludes, type SoldAudience } from "../served-to.js";

/**
 * **Un choix d'option, tel que le référentiel l'apporte** (« tranché »,
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.1) : sa clé
 * stable, son libellé, et la clientèle à qui il se propose.
 */
export interface CatalogOptionChoice {
  readonly key: string;
  readonly label: string;
  readonly audience: SoldAudience;
}

/** Un groupe d'options actif sur un article (« Tranchage »), ses choix en service dans leur ordre. */
export interface CatalogOptionGroup {
  readonly id: string;
  readonly name: string;
  readonly choices: readonly CatalogOptionChoice[];
}

/** Un choix tel qu'une clientèle le voit — sans sa clientèle, déjà jugée. */
export interface OfferedOptionChoice {
  readonly key: string;
  readonly label: string;
}

/** Un groupe tel qu'une clientèle le voit : seulement les choix qui lui sont proposés. */
export interface OfferedOptionGroup {
  readonly id: string;
  readonly name: string;
  readonly choices: readonly OfferedOptionChoice[];
}

/**
 * **Ce qu'une clientèle se voit proposer** des groupes d'un article (§ 3.2) :
 * les choix de son audience, dans leur ordre ; un groupe dont aucun choix ne
 * lui est proposé disparaît. C'est la règle « chaque audience, son
 * information » : un choix réservé aux pros n'est jamais servi au public, et
 * l'audience est celle que le serveur a résolue pour l'appelant.
 */
export function optionGroupsOfferedTo(
  groups: readonly CatalogOptionGroup[],
  audience: ShopAudience,
): readonly OfferedOptionGroup[] {
  return groups.flatMap((group) => {
    const choices = group.choices
      .filter((choice) => audienceIncludes(choice.audience, audience))
      .map((choice) => ({ key: choice.key, label: choice.label }));
    return choices.length === 0 ? [] : [{ id: group.id, name: group.name, choices }];
  });
}
