import { z } from "zod";

import type { CollectionReturnKindView } from "./collection-return.js";

/**
 * **Le prélèvement d'essai et nos établissements** (plan
 * `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`).
 * Montants en centimes, jours en `AAAA-MM-JJ`, instants ISO. Jamais d'IBAN
 * entier : ses quatre derniers caractères au plus.
 *
 * Le contrat ne valide que la FORME : le plafond du montant, la séquence
 * permise par le mandat et l'échéance au calendrier sont des règles de
 * l'agrégat, qui les refuse en les nommant.
 */

/** `FNAL` n'y est pas : inexprimable (Q7, Hugo 2026-10-22). */
export const testSequenceSchema = z.enum(["RCUR", "FRST", "OOFF"]);
export type TestSequenceView = z.infer<typeof testSequenceSchema>;

export const TEST_SEQUENCE_LABELS: Readonly<Record<TestSequenceView, string>> = {
  RCUR: "RCUR — récurrent",
  FRST: "FRST — premier d'une série",
  OOFF: "OOFF — ponctuel",
};

const day = z.iso.date();

/** Déclarer une société parmi nos établissements. */
export const declareOwnEstablishmentPayloadSchema = z.object({
  companyId: z.string().min(1),
});
export type DeclareOwnEstablishmentPayload = z.infer<typeof declareOwnEstablishmentPayloadSchema>;

/** Générer un essai. `remittance` : `null` ou vide = « ESSAI PRELEVEMENT ». */
export const generateCollectionTestPayloadSchema = z.object({
  companyId: z.string().min(1),
  amountCents: z.number().int(),
  requestedCollectionDay: day,
  sequence: testSequenceSchema,
  remittance: z.string().max(140).nullable(),
});
export type GenerateCollectionTestPayload = z.infer<typeof generateCollectionTestPayloadSchema>;

/** « Marqué remboursé » : le jour du virement rendu. */
export const markCollectionTestRefundedPayloadSchema = z.object({
  refundedOn: day,
});
export type MarkCollectionTestRefundedPayload = z.infer<
  typeof markCollectionTestRefundedPayloadSchema
>;

/** Un de nos établissements, tel que la page le liste. */
export interface OwnEstablishmentView {
  readonly companyId: string;
  readonly companyName: string;
  readonly companyStatus: string;
  readonly declaredAt: string;
  /** « Prénom Nom » de qui l'a déclarée ; `null` si l'annuaire ne la connaît plus. */
  readonly declaredByName: string | null;
}

export interface OwnEstablishmentsView {
  readonly establishments: readonly OwnEstablishmentView[];
}

/** Le mandat sous lequel un essai prélèverait. */
export interface CollectionTestMandateView {
  readonly reference: string;
  readonly scheme: "CORE" | "B2B";
  readonly paymentType: "recurrent" | "one_off";
  readonly ibanLast4: string;
}

/** Un établissement dans l'outil : prélevable à l'essai, ou pourquoi pas. */
export interface CollectionTestDebtorView {
  readonly companyId: string;
  readonly companyName: string;
  /** `null` si aucun mandat n'est retenu (refus). */
  readonly mandate: CollectionTestMandateView | null;
  /** Vide si refusé. La première est la séquence par défaut. */
  readonly sequences: readonly TestSequenceView[];
  /** L'échéance proposée — la plus proche que le calendrier admet ; `null` si refusé. */
  readonly earliestCollectionDay: string | null;
  /** Le refus, en mots ; `null` si l'essai est possible. */
  readonly refusal: string | null;
}

export interface CollectionTestDebtorsView {
  /** Le plafond d'un essai, en centimes — affiché, la règle est côté serveur. */
  readonly maxAmountCents: number;
  readonly defaultRemittance: string;
  readonly debtors: readonly CollectionTestDebtorView[];
}

export type CollectionTestStatusView =
  "awaiting_due_date" | "to_refund" | "returned" | "refunded" | "refunded_and_returned";

export const COLLECTION_TEST_STATUS_LABELS: Readonly<Record<CollectionTestStatusView, string>> = {
  awaiting_due_date: "Avant l'échéance",
  to_refund: "À rembourser",
  returned: "Rejeté ou retourné par la banque",
  refunded: "Remboursé",
  refunded_and_returned: "Remboursé ET retourné par la banque — à régulariser",
};

export interface CollectionTestReturnView {
  readonly kind: CollectionReturnKindView;
  readonly reasonCode: string;
  readonly reason: string;
  readonly returnedOn: string;
  readonly amountCents: number;
}

/** Un essai dans la liste « Essais ». */
export interface CollectionTestView {
  readonly id: string;
  readonly messageId: string;
  readonly debtorName: string;
  readonly mandateReference: string;
  readonly scheme: "CORE" | "B2B";
  readonly sequence: TestSequenceView;
  readonly amountCents: number;
  readonly requestedCollectionDay: string;
  readonly remittance: string;
  readonly createdAt: string;
  readonly createdByName: string | null;
  readonly status: CollectionTestStatusView;
  readonly bankReturn: CollectionTestReturnView | null;
  readonly refundedOn: string | null;
  readonly refundedByName: string | null;
}

export interface CollectionTestsView {
  readonly tests: readonly CollectionTestView[];
}

export interface CollectionTestCreatedView {
  readonly testId: string;
}
