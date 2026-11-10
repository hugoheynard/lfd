import type { SaleUnit } from "../domain/resupply-sale-unit.js";
import type { ResupplyTarget } from "../domain/site-resupply.js";

/** Une ligne demandée, telle que l'écran l'envoie : le libellé est lu au catalogue. */
export interface RequestedResupplyLine {
  readonly sku: string;
  readonly quantity: number;
  /** Gardée par un brouillon (le réassort au poids, L2b-1) : doit être celle du catalogue. Absente : le catalogue la donne. */
  readonly saleUnit?: SaleUnit | undefined;
}

/**
 * « Envoyer un réassort » depuis le fournil, pour un point (R1d). Acte
 * staff ; rend l'identifiant du réassort créé.
 *
 * `key` est fournie par l'écran, une par ouverture du panneau : elle devient
 * l'identifiant du réassort, et un second envoi avec la même clé ne fait rien
 * (C-A, audit du 2026-11-02 — deux clics faisaient deux réassorts).
 */
export class SendBakehouseResupplyCommand {
  constructor(
    readonly siteId: string,
    readonly key: string,
    readonly target: ResupplyTarget,
    readonly lines: readonly RequestedResupplyLine[],
    readonly staffUserId: string,
    /** Son nom libre (R1g) ; `null` ou vide : sans nom. */
    readonly name: string | null = null,
  ) {}
}
