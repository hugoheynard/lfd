import { z } from "zod";

/**
 * **Les lots de prélèvement figés**, tels que l'écran du cycle les lit (plan
 * `documentation/comptabilite/prelevement/plan-lot-de-prelevement-fige.md`, §2, §4).
 * Montants en centimes.
 */

export type CollectionBatchStatusView = "constituted" | "deposited" | "cancelled";

export const COLLECTION_BATCH_STATUS_LABELS: Readonly<Record<CollectionBatchStatusView, string>> = {
  constituted: "Constitué — à déposer",
  deposited: "Déposé",
  cancelled: "Annulé",
};

export type CollectionExclusionReasonView =
  | "no_mandate"
  | "payer_detached"
  | "one_off_consumed"
  | "ambiguous_creditor"
  | "unbillable"
  | "invoice_split";

/** Ce que l'écran dit d'une raison d'exclusion — et le geste de sortie. */
export const COLLECTION_EXCLUSION_REASON_LABELS: Readonly<
  Record<CollectionExclusionReasonView, string>
> = {
  no_mandate: "Sans mandat prélevable — faire signer le mandat, ou régler autrement",
  payer_detached: "Le site ne suit plus son payeur — le rattacher, ou régler autrement",
  one_off_consumed: "Mandat ponctuel déjà prélevé — un nouveau mandat est nécessaire",
  ambiguous_creditor: "Deux mandats actifs chez deux entités — en révoquer un",
  unbillable:
    "Non facturable — bon incohérent ou sans taux de TVA : le signaler à l'équipe technique, ou régler autrement",
  invoice_split:
    "Sa facture tomberait sur plusieurs mandats — une facture ne se prélève pas en morceaux : régler autrement, ou ne garder qu'un mandat",
};

/** L'état d'encaissement d'une commande — `due` quand aucun lot ne l'a vue. */
export type OrderCollectionStateView =
  | "due"
  | "batched"
  | "excluded"
  | "collected"
  | "settled_otherwise"
  /** Sa ligne est revenue de la banque (plan `plan-retours-bancaires.md`). */
  | "returned"
  | "written_off";

export const ORDER_COLLECTION_STATE_LABELS: Readonly<Record<OrderCollectionStateView, string>> = {
  due: "À prélever",
  batched: "Dans un lot",
  excluded: "Écartée",
  collected: "Prélevée",
  settled_otherwise: "Réglée autrement",
  returned: "Rejetée par la banque",
  written_off: "Passée en perte",
};

/**
 * L'état de l'avis de prélèvement d'une ligne (plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA2).
 * `queued` = mis en file, PAS envoyé ; `unsendable` = ni contact de
 * facturation ni détenteur avec une adresse — rien n'est parti.
 */
export type CollectionNoticeStatusView = "queued" | "sent" | "failed" | "unsendable";

/**
 * Ce que l'avis annonce : un premier avis, un rectificatif (montant, date ou
 * RUM changés depuis un avis parti d'un lot annulé), une annulation (le payeur
 * n'est plus prélevé), ou `unchanged` — l'avis parti tient toujours, rien n'est
 * renvoyé.
 */
export type CollectionNoticeKindView = "notice" | "correction" | "cancellation" | "unchanged";

/** L'avis d'une ligne de débit. */
export interface CollectionLineNoticeView {
  readonly kind: CollectionNoticeKindView;
  readonly status: CollectionNoticeStatusView;
  /** `null` quand l'avis n'est pas envoyable. */
  readonly recipientEmail: string | null;
  /** ISO — l'envoi accepté par le fournisseur ; `null` tant qu'il ne l'est pas. */
  readonly sentAt: string | null;
  /** Le refus du fournisseur, tel quel ; `null` hors échec. */
  readonly failure: string | null;
}

/**
 * Une ligne de débit du lot, telle que l'écran la lit (plan
 * `documentation/comptabilite/facturation/le-prelevement-suit-la-facture.md`).
 */
export interface CollectionBatchLineView {
  readonly rank: number;
  readonly debtorName: string;
  /** Ce que la ligne prélève — le total de son arrêté (F2), ou de ses factures (E4). */
  readonly amountCents: number;
  /** Σ des bons ; `null` pour une ligne d'un lot constitué avant F2. */
  readonly ordersTotalCents: number | null;
  /**
   * L'arrêté de facturation de la ligne ; `null` pour un lot constitué avant
   * F3 — « lot d'avant l'arrêté de facturation », jamais zéro.
   */
  readonly billingStatementId: string | null;
  /**
   * Les factures émises que la ligne encaisse, par numéro (plan
   * `facture-emise.md`) — vide pour une ligne d'arrêté.
   * Une ligne a l'un ou l'autre, jamais les deux.
   */
  readonly invoiceNumbers: readonly string[];
  /** `null` pour un lot constitué avant les avis (PA2, 2026-10-08) : il ne se dépose pas. */
  readonly notice: CollectionLineNoticeView | null;
}

/** L'auteur d'un lot — un genre, pas une personne. */
export type CollectionBatchAuthorView = "staff" | "system";

export interface CollectionBatchView {
  readonly id: string;
  readonly scheme: "CORE" | "B2B";
  /** ISO — inclusif. */
  readonly cycleStartsAt: string;
  /** ISO — exclusif. */
  readonly cycleClosesAt: string;
  readonly status: CollectionBatchStatusView;
  readonly constitutedAt: string;
  /**
   * Qui l'a préparé : la comptabilité (`staff`), ou la constitution
   * automatique (`system`, plan `prelevement-automatique.md`, PA3).
   * L'écran dit « préparé automatiquement » ; aucune fiche n'est nommée.
   */
  readonly constitutedBy: CollectionBatchAuthorView;
  readonly depositedAt: string | null;
  readonly cancelledAt: string | null;
  readonly lineCount: number;
  readonly orderCount: number;
  readonly totalCents: number;
  /** Q2 : non vide = le lot ne se dépose pas, et l'écran les nomme en tête. */
  readonly unmandatedCompanies: readonly string[];
  readonly depositable: boolean;
  /**
   * L'échéance FIGÉE à la constitution (`AAAA-MM-JJ`) — celle du fichier.
   * `null` pour un lot constitué avant le 2026-10-08 (plan
   * `prelevement-automatique.md`, PA1) : on n'invente pas sa valeur, le
   * XML stocké fait foi.
   */
  readonly requestedCollectionDay: string | null;
  /**
   * L'échéance que le calendrier donnait (clôture + N, TARGET2) quand elle
   * diffère de `requestedCollectionDay` : la constitution tardive l'a
   * repoussée pour tenir le délai de pré-notification (D4). `null` sinon.
   */
  readonly postponedFromDay: string | null;
  /**
   * La date limite de dépôt de cette échéance, au cut-off ACTUEL de l'entité ;
   * `null` si l'échéance n'est pas figée ou si le cut-off est à renseigner.
   */
  readonly depositDeadline: { readonly day: string; readonly time: string } | null;
  /** Dans l'ordre des rangs. */
  readonly lines: readonly CollectionBatchLineView[];
}

export interface CollectionExclusionView {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly companyName: string;
  readonly placedAt: string;
  readonly amountCents: number;
  readonly reason: CollectionExclusionReasonView;
}

export interface CollectionCycleView {
  readonly batches: readonly CollectionBatchView[];
  readonly exclusions: readonly CollectionExclusionView[];
}

/** `POST …/batches` — la constitution rend les lots créés. */
export interface ConstitutedBatchesView {
  readonly batchIds: readonly string[];
}

/** « Réglée autrement » : la note dit comment. La FORME seulement. */
export const settleOrderOtherwisePayloadSchema = z.strictObject({
  note: z.string().min(1).max(500),
});
export type SettleOrderOtherwisePayload = z.infer<typeof settleOrderOtherwisePayloadSchema>;

/** `POST …/batches` — l'entité est demandée, jamais devinée. */
export const constituteBatchesPayloadSchema = z.strictObject({
  legalEntityId: z.string().min(1),
});
export type ConstituteBatchesPayload = z.infer<typeof constituteBatchesPayloadSchema>;

/**
 * Une ligne de l'**aperçu du mois** : ce que la prochaine préparation du lot
 * débiterait à ce payeur, calculé comme le lot (plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA4) — la
 * facture de ses bons en une fois, pas leur somme.
 */
export interface CollectionPreviewLineView {
  readonly scheme: "CORE" | "B2B";
  readonly payerCompanyId: string;
  readonly debtorName: string;
  readonly orderCount: number;
  /** Le total de la facture de la ligne — ce qui serait prélevé. */
  readonly amountCents: number;
  /** Σ des totaux des bons ; l'écart est `amountCents − ordersTotalCents`. */
  readonly ordersTotalCents: number;
}

/** L'aperçu d'un mois prélevable : rien n'est écrit, rien n'est verrouillé. */
export interface CollectionPreviewOpenView {
  readonly state: "open";
  /** ISO — inclusif. */
  readonly cycleStartsAt: string;
  /** ISO — exclusif : la prochaine clôture. */
  readonly cycleClosesAt: string;
  /** ISO — la mise en service du prélèvement : aucune commande d'avant n'entre. */
  readonly floorAt: string;
  /** Dans l'ordre des rangs du lot (par schéma, puis par nom). */
  readonly lines: readonly CollectionPreviewLineView[];
  readonly totalCents: number;
  readonly ordersTotalCents: number;
  /** Les bons qui seraient écartés, et pourquoi. */
  readonly exclusions: readonly CollectionExclusionView[];
  /** Les payeurs sans mandat — ils rendraient le lot non déposable. */
  readonly unmandatedCompanies: readonly string[];
}

/**
 * Le mois n'est pas encore prélevable : la mise en service tombe après sa
 * clôture. Les deux dates disent quand le premier le sera.
 */
export interface CollectionPreviewNotYetOpenView {
  readonly state: "not_yet_open";
  /** ISO — la mise en service du prélèvement. */
  readonly floorAt: string;
  /** ISO — la clôture du premier mois prélevable. */
  readonly firstClosureAt: string;
}

/** `GET admin/accounting/collection/preview?legalEntityId=` */
export type CollectionPreviewView = CollectionPreviewOpenView | CollectionPreviewNotYetOpenView;
