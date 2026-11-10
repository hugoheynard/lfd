import { categoryPathOf } from "@lfd/catalog-sync";

import type { CatalogFamilyAncestor } from "../domain/catalog-family.js";
import { translationsColumnOf } from "./catalog-translations-column.js";

/** Une ligne du miroir `catalog_categories`, réduite à ce que la lignée lit. */
export interface FamilyMirrorRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly position: number;
  readonly nameTranslations: unknown;
}

/** La lignée d'une famille : son chemin (elle en tête), et ses parentes nommées. */
export interface FamilyLineage {
  readonly path: readonly string[];
  readonly ancestors: readonly CatalogFamilyAncestor[];
}

/** Résout la lignée d'une famille par son identifiant. */
export type Lineage = (familyId: string) => FamilyLineage;

/** Le catalogue sans hiérarchie : chaque famille est sa propre lignée. */
export const FLAT_LINEAGE: Lineage = (familyId) => ({ path: [familyId], ancestors: [] });

/**
 * **La lignée depuis le miroir entier**, mémoïsée par famille.
 *
 * La descente reste `categoryPathOf` — celle de l'heure limite et de la
 * tarification : une seconde implémentation finirait par diverger. Les
 * parentes sont nommées depuis les mêmes lignes, pour la boutique qui range
 * ses rayons en arbre. Une parente absente du miroir arrête la descente,
 * comme elle l'arrête déjà pour `path`.
 */
export function lineageFrom(families: readonly FamilyMirrorRow[]): Lineage {
  const byId = new Map(families.map((family) => [family.id, family]));
  const nodes = families.map((family) => ({ id: family.id, parentId: family.parentId }));
  const cache = new Map<string, FamilyLineage>();
  return (familyId) => {
    const known = cache.get(familyId);
    if (known !== undefined) {
      return known;
    }
    const path = categoryPathOf(nodes, familyId);
    const ancestors = path.slice(1).flatMap((id) => {
      const family = byId.get(id);
      return family === undefined
        ? []
        : [
            {
              id: family.id,
              name: family.name,
              position: family.position,
              nameTranslations: translationsColumnOf(family.nameTranslations),
            },
          ];
    });
    const lineage = { path, ancestors };
    cache.set(familyId, lineage);
    return lineage;
  };
}
