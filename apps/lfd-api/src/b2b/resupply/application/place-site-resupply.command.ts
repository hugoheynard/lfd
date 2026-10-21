import type { ResupplyTarget } from "../domain/site-resupply.js";

/** Une ligne demandée, telle que l'écran l'envoie : le libellé est lu au catalogue. */
export interface RequestedResupplyLine {
  readonly sku: string;
  readonly quantity: number;
}

/** Passe un réassort pour un point. Acte staff ; rend l'identifiant. */
export class PlaceSiteResupplyCommand {
  constructor(
    readonly siteId: string,
    readonly target: ResupplyTarget,
    readonly lines: readonly RequestedResupplyLine[],
    readonly staffUserId: string,
  ) {}
}
