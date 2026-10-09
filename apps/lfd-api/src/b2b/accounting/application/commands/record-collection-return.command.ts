import type { BankReturnKind } from "../../domain/value-objects/bank-return-reason.js";

/**
 * Saisit à la main le retour bancaire d'une ligne de lot (plan
 * `plan-retours-bancaires.md`, R5a) : le montant est celui de la ligne.
 */
export class RecordCollectionReturnCommand {
  constructor(
    readonly batchId: string,
    readonly rank: number,
    readonly kind: BankReturnKind,
    readonly reasonCode: string,
    readonly reasonLabel: string | null,
    /** `AAAA-MM-JJ` — la date que la banque donne. */
    readonly returnedOn: string,
    readonly feeCents: number | null,
    readonly staffUserId: string,
  ) {}
}
