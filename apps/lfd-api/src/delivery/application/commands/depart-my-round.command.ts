import type { DepartDeliveryRoundPayload } from "@lfd/contracts";

/**
 * **« Commencer ma tournée »** — la porte du LIVREUR (plan « Ma tournée »,
 * MT-D3 v2). `staffUserId` est la fiche de la requête : c'est le mur.
 */
export class DepartMyRoundCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly payload: DepartDeliveryRoundPayload,
  ) {}
}
