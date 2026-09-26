import type { CatalogFamily } from "../catalog-family.js";

/**
 * **Des familles telles que le référentiel les livre**, pour les suites.
 *
 * Des identifiants opaques, et exprès : depuis le 2026-09-26, aucun code ne
 * connaît une famille par son nom (plan des familles en données). Une suite qui
 * écrirait un ancien code de rayon éprouverait la table qu'on a retirée.
 */
export function family(
  id: string,
  name: string,
  position: number,
  parents: readonly string[] = [],
): CatalogFamily {
  return { id, name, position, slug: id, path: [id, ...parents] };
}

export const VIENNOISERIES = family("fam-vien", "Viennoiseries", 0);
export const PAINS = family("fam-pain", "Pains", 1);
export const PATISSERIES = family("fam-patis", "Pâtisseries", 2);
export const CHOCOLAT = family("fam-choco", "Chocolat & confiserie", 4);
