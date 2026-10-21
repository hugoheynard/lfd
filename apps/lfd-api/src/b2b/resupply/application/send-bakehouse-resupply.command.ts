import type { ResupplyTarget } from "../domain/site-resupply.js";

/** Une ligne demandée, telle que l'écran l'envoie : le libellé est lu au catalogue. */
export interface RequestedResupplyLine {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * « Envoyer un réassort » depuis le fournil, pour un point (lot R1d). Acte
 * staff ; rend l'identifiant du réassort créé.
 */
export class SendBakehouseResupplyCommand {
  constructor(
    readonly siteId: string,
    readonly target: ResupplyTarget,
    readonly lines: readonly RequestedResupplyLine[],
    readonly staffUserId: string,
  ) {}
}
