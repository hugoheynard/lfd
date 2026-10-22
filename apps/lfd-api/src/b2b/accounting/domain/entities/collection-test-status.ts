/**
 * **Où en est un prélèvement d'essai** (plan `plan-prelevement-d-essai.md`,
 * Q4 — Hugo, 2026-10-22).
 *
 * - `awaiting_due_date` : l'échéance n'est pas atteinte ;
 * - `to_refund` : l'échéance est passée sans retour de la banque — l'argent a
 *   pu être prélevé sur notre établissement, sans pièce, et il est « à
 *   rembourser » jusqu'au geste « Marqué remboursé » ;
 * - `returned` : la banque a rejeté ou retourné le débit — rien à rembourser ;
 * - `refunded` : marqué remboursé ;
 * - `refunded_and_returned` : marqué remboursé, PUIS un retour de la banque
 *   est arrivé — l'établissement a été remboursé deux fois, à régulariser.
 *
 * ⚠️ Rien ne sait si le fichier a été DÉPOSÉ : l'outil le fait télécharger, il
 * ne le dépose pas. Un essai jamais déposé passera donc « à rembourser » à son
 * échéance comme un autre ; c'est au staff de le savoir.
 */
export type CollectionTestStatus =
  "awaiting_due_date" | "to_refund" | "returned" | "refunded" | "refunded_and_returned";

export interface CollectionTestStatusFacts {
  readonly requestedCollectionDay: string;
  readonly bankReturn: unknown;
  readonly refund: unknown;
}

/** `today` : un jour local `AAAA-MM-JJ`, comparé à l'échéance. */
export function collectionTestStatus(
  facts: CollectionTestStatusFacts,
  today: string,
): CollectionTestStatus {
  const returned = facts.bankReturn !== null;
  if (facts.refund !== null) {
    return returned ? "refunded_and_returned" : "refunded";
  }
  if (returned) {
    return "returned";
  }
  return today < facts.requestedCollectionDay ? "awaiting_due_date" : "to_refund";
}
