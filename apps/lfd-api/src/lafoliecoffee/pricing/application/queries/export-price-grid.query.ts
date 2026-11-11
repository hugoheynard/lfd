import type { PriceGridExportPayload } from "@lfd/contracts";

/**
 * « La grille de prix de ce public, à cette date, pour cet acheminement » —
 * un CSV pour une plaquette (`export-grille-de-prix.md`). Lecture seule.
 */
export class ExportPriceGridQuery {
  constructor(readonly payload: PriceGridExportPayload) {}
}

/** Le fichier rendu : son nom, et son contenu (BOM compris). */
export interface PriceGridFile {
  readonly fileName: string;
  readonly csv: string;
}
