import type { CatalogViewer } from "../../../catalog/domain/catalog-viewer.js";

/**
 * **Le lecteur du catalogue d'une société précise** — la décision de la
 * vitrine (`CatalogViewers.forCompany`, servi) : une société en attente est
 * servie en pro, une suspendue au public.
 *
 * Les ports de la grille prennent un LECTEUR, pas un `companyId`
 * (`export-grille-de-prix.md`, § 6.3) : un pro type n'est aucune société,
 * et son lecteur — `PRO_ANONYMOUS_VIEWER` — se pose sans rien lire.
 */
export abstract class PriceGridViewerReader {
  abstract viewerOf(companyId: string): Promise<CatalogViewer>;
}
