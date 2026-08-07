/**
 * Étape d'activation franchie — aligné sur les **pièces** (`ActivationPiece`) :
 * TVA renseignée, KBIS déposé, adresse de facturation / de livraison saisie.
 */
export type ActivationStep = "tva" | "kbis" | "billing" | "delivery";

/**
 * Fait de domaine : **une pièce d'activation vient d'être fournie**. Chaque étape
 * ne compte qu'une fois (la clé d'idempotence du journal est par société+étape) :
 * c'est ce flux qui alimentera la **complétion / les frictions** (Phase 1) —
 * quelles pièces manquent, et depuis combien de temps (adoption-stalled).
 */
export class CompanyStepReachedEvent {
  constructor(
    readonly companyId: string,
    readonly step: ActivationStep,
  ) {}
}
