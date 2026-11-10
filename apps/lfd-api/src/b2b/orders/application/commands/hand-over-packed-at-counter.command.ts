import type { ShortfallRemainder } from "@lfd/contracts";

/**
 * **« Remettre ce qui est au bac »** — le départ incomplet décidé au
 * comptoir, et la remise, d'un seul geste (plan
 * `documentation/commandes/reliquat/depart-incomplet.md`, §4.2 —
 * Hugo, 2026-11-03).
 *
 * `staffUserId` est l'id de la FICHE, reçu de la porte : il signe la
 * décision ET la remise. Aucune quantité : ce qui part est ce qui est au bac.
 * `remainder` est le sort du reste, séparé de la garde « qui peut décider au
 * comptoir » (§4.3). `token` : le jeton du QR lu au scan, ou `null` — la
 * remise est alors `scan` ou `manual` (Hugo, 2026-11-03).
 */
export class HandOverPackedAtCounterCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
    readonly remainder: ShortfallRemainder,
    readonly token: string | null = null,
  ) {}
}
