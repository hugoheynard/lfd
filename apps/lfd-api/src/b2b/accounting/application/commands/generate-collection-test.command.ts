import type { TestSequence } from "../../domain/services/pain008-document.js";

/**
 * Génère un prélèvement d'essai sur un de nos établissements (plan
 * `plan-prelevement-d-essai.md`). Rend l'id de l'essai ; le fichier se
 * télécharge ensuite.
 */
export class GenerateCollectionTestCommand {
  constructor(
    readonly companyId: string,
    readonly amountCents: number,
    /** `AAAA-MM-JJ` — `ReqdColltnDt`. */
    readonly requestedCollectionDay: string,
    readonly sequence: TestSequence,
    /** `null` ou vide : « ESSAI PRELEVEMENT ». */
    readonly remittance: string | null,
    readonly staffUserId: string,
  ) {}
}
