import { z } from "zod";

/**
 * **Les retours bancaires d'un prélèvement** (plan
 * `documentation/comptabilite/prelevement/retours-bancaires.md` et
 * R5b). Montants en centimes, jours en `AAAA-MM-JJ`. Jamais d'IBAN.
 */

export type CollectionReturnKindView = "reject" | "return" | "refund_request";
export type CollectionReturnSourceView = "manual" | "pain002" | "camt054";
export type CollectionReturnResolutionView =
  "pending" | "represented" | "settled_otherwise" | "written_off";

export const COLLECTION_RETURN_KIND_LABELS: Readonly<Record<CollectionReturnKindView, string>> = {
  reject: "Rejet (avant règlement)",
  return: "Retour (après règlement)",
  refund_request: "Remboursement demandé",
};

export const COLLECTION_RETURN_RESOLUTION_LABELS: Readonly<
  Record<CollectionReturnResolutionView, string>
> = {
  pending: "À traiter",
  represented: "Re-présenté au prochain lot",
  settled_otherwise: "Réglé autrement",
  written_off: "Passé en perte",
};

export const COLLECTION_RETURN_SOURCE_LABELS: Readonly<Record<CollectionReturnSourceView, string>> =
  {
    manual: "Saisi à la main",
    pain002: "Fichier pain.002",
    camt054: "Fichier camt.054",
  };

/** Ce qu'on peut encore faire d'un retour à traiter. */
export interface CollectionReturnGesturesView {
  /** `null` = re-présentable ; sinon, pourquoi pas, en mots. */
  readonly representRefusal: string | null;
  /** Le motif dit que le mandat ne tient plus : proposer de le révoquer. */
  readonly proposesRevocation: boolean;
}

/** Un retour, tel que l'écran du lot et la fiche du payeur le lisent. */
export interface CollectionReturnView {
  readonly id: string;
  readonly endToEndId: string;
  readonly batchId: string;
  /** « Lot CORE 202609 ». */
  readonly batchLabel: string;
  readonly lineRank: number;
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  /** Le mandat de la ligne — l'écran lie vers sa révocation. */
  readonly mandateId: string;
  readonly mandateReference: string;
  readonly kind: CollectionReturnKindView;
  readonly reasonCode: string;
  /** Les mots du motif. */
  readonly reason: string;
  readonly returnedOn: string;
  readonly amountCents: number;
  readonly feeCents: number | null;
  readonly source: CollectionReturnSourceView;
  readonly recordedAt: string;
  readonly resolution: CollectionReturnResolutionView;
  readonly resolutionNote: string | null;
  readonly resolvedAt: string | null;
  /** `null` une fois traité. */
  readonly gestures: CollectionReturnGesturesView | null;
}

/** Un motif de la liste fermée, pour la saisie. */
export interface BankReturnReasonView {
  readonly code: string;
  readonly label: string;
}

/** Les retours d'un lot, et la liste des motifs pour en saisir un. */
export interface BatchCollectionReturnsView {
  readonly returns: readonly CollectionReturnView[];
  readonly reasons: readonly BankReturnReasonView[];
}

const day = z.iso.date();

/** « Signaler un retour » sur une ligne. Le montant est celui de la ligne. */
export const recordCollectionReturnPayloadSchema = z.object({
  kind: z.enum(["reject", "return", "refund_request"]),
  reasonCode: z.string().min(1).max(4),
  reasonLabel: z.string().max(140).nullable(),
  returnedOn: day,
  feeCents: z.number().int().nonnegative().nullable(),
});
export type RecordCollectionReturnPayload = z.infer<typeof recordCollectionReturnPayloadSchema>;

/** Régler autrement, ou passer en perte : une note. */
export const resolveCollectionReturnPayloadSchema = z.object({
  note: z.string().min(1).max(500),
});
export type ResolveCollectionReturnPayload = z.infer<typeof resolveCollectionReturnPayloadSchema>;

/**
 * Ce qu'un fichier de la banque dit d'une transaction, et ce qu'on en ferait
 * (R5b). `matched` seul s'enregistre à la confirmation.
 */
export type ImportedReturnStatusView =
  "matched" | "unknown" | "amount_mismatch" | "already_returned" | "not_returnable";

export interface ImportedReturnView {
  readonly endToEndId: string;
  readonly status: ImportedReturnStatusView;
  readonly kind: CollectionReturnKindView;
  readonly reasonCode: string;
  readonly reason: string;
  readonly returnedOn: string;
  /** Le montant que la banque dit. */
  readonly amountCents: number;
  /** Le montant de la ligne appariée ; `null` si inconnue. */
  readonly lineAmountCents: number | null;
  readonly debtorName: string | null;
  readonly batchLabel: string | null;
  /** Pourquoi elle ne s'enregistrerait pas, en mots ; `null` si appariée. */
  readonly problem: string | null;
}

export interface CollectionReturnImportPreviewView {
  readonly format: "pain002" | "camt054";
  readonly entries: readonly ImportedReturnView[];
}

/** La confirmation : le fichier de nouveau, et les transactions retenues. */
export const confirmCollectionReturnImportFieldsSchema = z.object({
  endToEndIds: z.array(z.string().min(1).max(35)).min(1).max(500),
});
export type ConfirmCollectionReturnImportFields = z.infer<
  typeof confirmCollectionReturnImportFieldsSchema
>;

export interface CollectionReturnImportResultView {
  readonly recordedIds: readonly string[];
}
