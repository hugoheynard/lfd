import type { SiteTableView } from "@lfd/contracts";

/**
 * **Le port de lecture de la grille de tables** — l'écran Réglages › Sites.
 * Il compose l'adresse de chaque QR ; l'agrégat n'en sait rien.
 */
export abstract class SiteTablesReader {
  /** Les tables du site, de 1 à N ; vide s'il n'en a pas. */
  abstract list(siteId: string): Promise<readonly SiteTableView[]>;
}
