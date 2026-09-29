import type { BinTypePayload } from "@lfd/contracts";

/** Corriger la fiche COMPLÈTE d'un type de bac. */
export class CorrectBinTypeCommand {
  constructor(
    readonly binTypeId: string,
    readonly payload: BinTypePayload,
  ) {}
}
