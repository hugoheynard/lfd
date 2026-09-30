import type { PurchaseBinCandidatePayload } from "@lfd/contracts";

/** Corriger la fiche ENTIÈRE d'un format de bac candidat. */
export class CorrectPurchaseBinCandidateCommand {
  constructor(
    readonly candidateId: string,
    readonly payload: PurchaseBinCandidatePayload,
    readonly staffUserId: string,
  ) {}
}
