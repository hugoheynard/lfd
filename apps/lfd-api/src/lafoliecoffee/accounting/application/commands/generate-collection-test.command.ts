import type { TestSequence } from "../../domain/services/pain008-document.js";

/** Un débiteur de l'envoi : montant et séquence sont par ligne. */
export interface CollectionTestDebtorRequest {
  readonly companyId: string;
  readonly amountCents: number;
  readonly sequence: TestSequence;
}

/**
 * Génère un envoi d'essai — un fichier, de un à dix de nos établissements
 * débités (plan `plan-essai-a-plusieurs-debiteurs.md`). Rend l'id de
 * l'envoi ; son fichier se télécharge ensuite, ses lignes se relisent dans la
 * liste « Essais ».
 */
export class GenerateCollectionTestCommand {
  constructor(
    readonly debtors: readonly CollectionTestDebtorRequest[],
    /** `AAAA-MM-JJ` — `ReqdColltnDt`, commune à l'envoi. */
    readonly requestedCollectionDay: string,
    /** `null` ou vide : « ESSAI PRELEVEMENT ». Commun à l'envoi. */
    readonly remittance: string | null,
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un second envoi rend le même envoi. */
    readonly intentKey: string,
  ) {}
}
