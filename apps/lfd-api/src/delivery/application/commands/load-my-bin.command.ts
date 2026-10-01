import type { LoadDeliveryBinPayload } from "@lfd/contracts";

/** Charger un bac dans MA tournée, par son QR ou son code tapé (PL1). */
export class LoadMyBinCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly payload: LoadDeliveryBinPayload,
  ) {}
}
