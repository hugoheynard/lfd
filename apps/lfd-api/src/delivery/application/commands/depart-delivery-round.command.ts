import type { DepartDeliveryRoundPayload } from "@lfd/contracts";

/** « Partir » : la tournée quitte le dépôt, à la version lue au chargement. */
export class DepartDeliveryRoundCommand {
  constructor(
    readonly roundId: string,
    readonly payload: DepartDeliveryRoundPayload,
  ) {}
}
