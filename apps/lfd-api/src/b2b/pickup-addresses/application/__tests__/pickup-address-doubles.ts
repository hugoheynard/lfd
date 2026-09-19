import type { PickupAddressView } from "@lfd/contracts";

import {
  PickupAddressRepository,
  type PickupAddressWrite,
} from "../../domain/pickup-address.repository.js";

/** Les champs d'un point de retrait, communs aux specs de création et de modification. */
export const FIELDS = {
  label: "Laboratoire",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
  isDefault: false,
  opening: { publicOpening: null, proPickup: null },
} as const;

/** Un point en base, et ce qu'on y écrit. */
export class StoredPoints extends PickupAddressRepository {
  written: PickupAddressWrite | null = null;

  constructor(private readonly stored: PickupAddressView | null) {
    super();
  }
  list(): Promise<readonly PickupAddressView[]> {
    return Promise.resolve(this.stored === null ? [] : [this.stored]);
  }
  resolve(): Promise<PickupAddressView | null> {
    return Promise.resolve(this.stored);
  }
  create(point: PickupAddressWrite): Promise<string> {
    this.written = point;
    return Promise.resolve("pickup_9");
  }
  update(_id: string, point: PickupAddressWrite): Promise<void> {
    this.written = point;
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
  setDefault(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
}
