import type { IngredientView } from "@lfd/pim-contracts";

import type { IngredientRecord } from "../domain/ports/ingredient.repository.js";

/**
 * La projection d'une matière vers ce que l'écran lit — partagée par les deux
 * lectures qui la rendent (le référentiel entier, et ce qu'une fiche cite).
 *
 * L'identifiant technique ne sort pas : le fil parle en clés, et l'appellation
 * en codes.
 */
export function toIngredientView(record: IngredientRecord): IngredientView {
  return {
    key: record.key,
    name: record.name,
    description: record.description,
    origin: record.origin,
    allergens: record.allergens,
    appellation:
      record.appellation === null
        ? null
        : {
            code: record.appellation.code,
            label: record.appellation.label,
            scheme: record.appellation.scheme,
            active: record.appellation.active,
            // Le compte n'a pas de sens sur une appellation lue À TRAVERS un
            // ingrédient : ce serait le compte de l'appellation, pas celui de
            // ce rattachement, et l'écran s'en servirait à tort.
            usedBy: 0,
          },
    usedBy: record.usedBy,
  };
}
