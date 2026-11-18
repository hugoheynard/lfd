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

/** Une ligne d'un envoi d'essai : l'établissement débité, son montant, sa séquence. */
export const collectionTestDebtorPayloadSchema = z.object({
  companyId: z.string().min(1),
  amountCents: z.number().int(),
  sequence: testSequenceSchema,
});
export type CollectionTestDebtorPayload = z.infer<typeof collectionTestDebtorPayloadSchema>;

/**
 * Générer un envoi d'essai : un fichier, au moins un débiteur. L'échéance et
 * le libellé sont communs à l'envoi ; `remittance` : `null` ou vide =
 * « ESSAI PRELEVEMENT ». Le nombre maximal de lignes, le doublon
 * d'établissement et le mélange de schémas ou de créanciers sont des règles
 * de l'agrégat (`maxDebtorsPerFile` de la vue de l'outil).
 */
export const generateCollectionTestPayloadSchema = z.object({
  debtors: z.array(collectionTestDebtorPayloadSchema).min(1),
  requestedCollectionDay: day,
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
  /** Le plafond d'un essai, en centimes, PAR LIGNE — affiché, la règle est côté serveur. */
  readonly maxAmountCents: number;
  /** Le nombre de lignes d'un envoi, au plus — affiché, la règle est côté serveur. */
  readonly maxDebtorsPerFile: number;
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

/** Un essai dans la liste « Essais » — une ligne d'un envoi. */
export interface CollectionTestView {
  readonly id: string;
  /** L'envoi qui le porte : son fichier se télécharge par `files/:fileId/file.xml`. */
  readonly fileId: string;
  /** Le `MsgId` de l'envoi — commun aux lignes d'un même fichier. */
  readonly messageId: string;
  /** `ESS-<ULID de l'essai>` — la ligne, que le retour de la banque cite. */
  readonly endToEndId: string;
  /** La société débitée — ce que les fichiers RIB et mandat de la ligne visent. */
  readonly debtorCompanyId: string;
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

/** L'envoi généré : ses lignes se relisent dans la liste « Essais ». */
export interface CollectionTestCreatedView {
  readonly fileId: string;
}
