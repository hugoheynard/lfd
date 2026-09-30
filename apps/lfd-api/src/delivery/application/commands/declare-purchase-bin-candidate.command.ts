import type { PurchaseBinCandidatePayload } from "@lfd/contracts";

/** Faire entrer un format de bac candidat dans la bibliothèque d'achat. Rend son identifiant. */
export class DeclarePurchaseBinCandidateCommand {
  constructor(
    readonly payload: PurchaseBinCandidatePayload,
    readonly staffUserId: string,
  ) {}
}
