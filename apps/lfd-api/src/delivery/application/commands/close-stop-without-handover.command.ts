import type { CloseStopWithoutHandoverPayload } from "@lfd/contracts";

/**
 * **Clore un arrêt sans remise** — la commande est déjà retirée, ou annulée
 * (`a-la-porte.md`, AP-D2, L6-C11). `staffUserId` est le mur.
 */
export class CloseStopWithoutHandoverCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly stopId: string,
    readonly payload: CloseStopWithoutHandoverPayload,
  ) {}
}
