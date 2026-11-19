import type { CategorySnapshot } from "../entities/category.js";

/**
 * **Toutes les familles, archivées comprises, rangées par position** — la
 * lecture que tiennent la liste des familles, l'arbre d'un déplacement, la
 * matrice des allergènes, les faits et la révision du catalogue.
 *
 * Port de LECTURE, à part du dépôt (ISP) : il rend l'instantané, jamais
 * l'agrégat — un lecteur n'a rien à muter.
 */
export abstract class AllCategoriesReader {
  abstract all(): Promise<CategorySnapshot[]>;
}
