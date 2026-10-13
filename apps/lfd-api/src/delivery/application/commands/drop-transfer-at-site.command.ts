import type { DropTransferAtSitePayload } from "@lfd/contracts";

/**
 * **« Remis au site »** — le livreur remet le transfert au site servi
 * (plan du transfert interne, §6.3, lot T2). `staffUserId` est le mur.
 */
export class DropTransferAtSiteCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly stopId: string,
    readonly payload: DropTransferAtSitePayload,
  ) {}
}
