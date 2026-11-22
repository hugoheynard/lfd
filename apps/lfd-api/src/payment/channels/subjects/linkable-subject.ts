import type { CardSubject } from "./subject-settlement.js";

/** Pourquoi un sujet ne se paie plus par son lien. */
export type SubjectUnpayableReason = "settled" | "cancelled";

/**
 * Ce que la page publique montre d'un sujet dû. **Aucune ligne de facture,
 * aucune adresse** : le détail reste dans l'espace authentifié.
 */
export interface PayableSubjectQuote {
  readonly payable: true;
  /** Le montant à payer, en centimes, strictement positif. */
  readonly amountCents: number;
  /** Qui encaisse (l'entité). */
  readonly payeeName: string;
  /** Qui paie. */
  readonly payerName: string;
  /** La référence que le payeur reconnaît (un numéro de facture). */
  readonly reference: string;
  /** L'échéance, en date du calendrier `AAAA-MM-JJ`, ou `null`. */
  readonly dueOn: string | null;
}

/** Le sujet ne veut plus être payé. */
export interface UnpayableSubjectQuote {
  readonly payable: false;
  readonly reason: SubjectUnpayableReason;
}

export type SubjectQuote = PayableSubjectQuote | UnpayableSubjectQuote;

/**
 * **« Combien, et pour qui ? »** (plan des liens, §2.2) — ce que `payment`
 * demande au bloc qui possède un sujet payable par lien. Un port **à part**
 * de `SubjectSettlement` (ISP) : un sujet qui s'encaisse sans lien (la
 * commande) ne l'implémente pas.
 */
export abstract class LinkableSubject {
  /** Le type de sujet servi — un seul implémenteur par type. */
  abstract readonly subjectType: string;

  /** Ce que la page montre, lu à chaque ouverture : jamais figé sur le lien. */
  abstract quote(subject: CardSubject): Promise<SubjectQuote>;
}
