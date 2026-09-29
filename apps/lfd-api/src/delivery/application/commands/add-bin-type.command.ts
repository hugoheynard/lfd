import type { BinTypePayload } from "@lfd/contracts";

/** Faire entrer un type de bac au catalogue. Rend son identifiant. */
export class AddBinTypeCommand {
  constructor(readonly payload: BinTypePayload) {}
}
