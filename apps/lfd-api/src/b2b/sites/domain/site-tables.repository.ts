import type { SiteTables } from "./site-tables.js";

/**
 * **Le port d'écriture de la grille de tables** — il prend et rend l'agrégat.
 * La lecture de l'écran est un autre port (`SiteTablesReader`, ISP).
 */
export abstract class SiteTablesRepository {
  /** La grille du site ; vide s'il n'a pas de tables. N'atteste pas que le site existe. */
  abstract load(siteId: string): Promise<SiteTables>;

  /** Remplace la grille du site par celle de l'agrégat. */
  abstract save(tables: SiteTables): Promise<void>;
}
