import type { SetBinCapacityPayload } from "@lfd/contracts";

/** Poser (`units`) ou retirer (`null`) UNE contenance de la grille. */
export class SetBinCapacityCommand {
  constructor(readonly payload: SetBinCapacityPayload) {}
}
