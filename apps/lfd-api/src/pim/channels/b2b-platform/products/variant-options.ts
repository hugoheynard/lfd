import type { SyncOptionGroup } from "@lfd/catalog-sync";

import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import type { ActiveOptionActivation } from "../../../catalogue/product/domain/ports/product-option-activations.reader.js";
import type { OptionGroupOffer } from "../../../reference/product-options/domain/ports/option-group-offers.reader.js";

/**
 * **Les groupes d'options de chaque déclinaison**, tels que le fait v19 les
 * porte (`plan-options-de-commande.md`, § 3.2) — pure.
 *
 * Un groupe part s'il est actif sur la déclinaison (pour toutes, ou nommée),
 * en service, et s'il lui reste au moins un choix en service ; ses choix
 * partent dans leur ordre. Les groupes d'une déclinaison suivent l'ordre
 * d'activation sur la fiche. Une déclinaison au poids les reçoit comme une
 * à la pièce.
 *
 * @returns id de déclinaison → ses groupes ; une déclinaison sans groupe n'a pas d'entrée.
 */
export function variantOptionsOf(
  products: readonly ProductRecord[],
  activations: ReadonlyMap<string, readonly ActiveOptionActivation[]>,
  offers: readonly OptionGroupOffer[],
): ReadonlyMap<string, readonly SyncOptionGroup[]> {
  const served = new Map(
    offers
      .filter((group) => !group.archived && group.choices.length > 0)
      .map((group) => [group.id, wireOf(group)] as const),
  );
  const options = new Map<string, SyncOptionGroup[]>();
  for (const product of products) {
    for (const activation of activations.get(product.id) ?? []) {
      const group = served.get(activation.groupId);
      if (group === undefined) {
        continue;
      }
      for (const variant of product.variants) {
        if (activation.variantIds === null || activation.variantIds.includes(variant.id)) {
          options.set(variant.id, [...(options.get(variant.id) ?? []), group]);
        }
      }
    }
  }
  return options;
}

function wireOf(group: OptionGroupOffer): SyncOptionGroup {
  return {
    id: group.id,
    name: group.name,
    choices: group.choices.map(({ key, label, audience }) => ({ key, label, audience })),
  };
}
