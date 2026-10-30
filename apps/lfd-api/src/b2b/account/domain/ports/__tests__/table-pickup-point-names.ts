import { PickupPointNames } from "../pickup-point-names.js";

/** Les noms des points de retrait, doublés à la main : une table, le reste inconnu. */
export class TablePickupPointNames extends PickupPointNames {
  constructor(private readonly names: ReadonlyMap<string, string> = new Map()) {
    super();
  }

  nameOf(pickupAddressId: string): Promise<string | null> {
    return Promise.resolve(this.names.get(pickupAddressId) ?? null);
  }
}
