import type { IngredientView } from "@lfd/pim-contracts";

import { AppellationNotFoundError } from "../domain/errors/ingredient-errors.js";
import type { AppellationRepository } from "../domain/ports/appellation.repository.js";
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

/**
 * Traduit un CODE d'appellation en identifiant technique.
 *
 * Le fil parle en codes — c'est l'identité lisible, celle que l'écran affiche
 * et que l'humain cite — et la base joint par identifiant. La traduction vit
 * ici, une fois, plutôt que dans chaque appelant.
 *
 * `null` reçu vaut « retirer le signe » ; `undefined` vaut « ne touche pas ».
 * Les confondre rendrait impossible d'annuler une appellation posée par erreur.
 */
/**
 * Une appellation citée au journal, avec son libellé français **du moment**
 * (D5 du plan des phrases du journal). Son `id` est son CODE : c'est sous lui
 * qu'elle écrit ses propres faits, et c'est par lui que l'écran la désigne.
 * `null` = aucune appellation revendiquée.
 *
 * @throws {AppellationNotFoundError} l'identifiant ne désigne aucune appellation.
 */
export async function namedAppellation(
  appellations: AppellationRepository,
  appellationId: string | null,
): Promise<{ readonly id: string; readonly name: string } | null> {
  if (appellationId === null) {
    return null;
  }
  const found = (await appellations.list()).find((record) => record.id === appellationId);
  if (found === undefined) {
    throw new AppellationNotFoundError(appellationId);
  }
  return { id: found.code, name: found.label.fr };
}

export async function resolveAppellation(
  appellations: AppellationRepository,
  code: string | null | undefined,
): Promise<string | null | undefined> {
  if (code === undefined) {
    return undefined;
  }
  if (code === null) {
    return null;
  }
  const id = await appellations.idOfCode(code);
  if (id === null) {
    throw new AppellationNotFoundError(code);
  }
  return id;
}
