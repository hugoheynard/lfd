import type { RequestedResupplyLine } from "./send-bakehouse-resupply.command.js";

/**
 * « Envoyer en boutique » (plan A1, lot A1.4) — sortir des pièces de la
 * réserve du colisage de `serviceDay` vers un point. Acte de superviseur ;
 * rend l'identifiant du réassort né du geste.
 *
 * `key` est fournie par l'écran, une par ouverture du panneau : elle devient
 * l'identifiant du réassort, et un second envoi avec la même clé ne fait
 * rien.
 */
export class SendReserveToShopCommand {
  constructor(
    /** `AAAA-MM-JJ` — la journée de la réserve. */
    readonly serviceDay: string,
    readonly siteId: string,
    readonly key: string,
    readonly lines: readonly RequestedResupplyLine[],
    readonly staffUserId: string,
  ) {}
}
