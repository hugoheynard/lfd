import { z } from "zod";

/**
 * **Les lots de prélèvement figés**, tels que l'écran du cycle les lit (plan
 * `documentation/comptabilite/plan-lot-de-prelevement-fige.md`, §2, §4).
 * Montants en centimes.
 */

export type CollectionBatchStatusView = "constituted" | "deposited" | "cancelled";

export const COLLECTION_BATCH_STATUS_LABELS: Readonly<Record<CollectionBatchStatusView, string>> = {
  constituted: "Constitué — à déposer",
  deposited: "Déposé",
  cancelled: "Annulé",
};

export type CollectionExclusionReasonView =
  "no_mandate" | "payer_detached" | "one_off_consumed" | "ambiguous_creditor";

/** Ce que l'écran dit d'une raison d'exclusion — et le geste de sortie. */
export const COLLECTION_EXCLUSION_REASON_LABELS: Readonly<
  Record<CollectionExclusionReasonView, string>
> = {
  no_mandate: "Sans mandat prélevable — faire signer le mandat, ou régler autrement",
  payer_detached: "Le site ne suit plus son payeur — le rattacher, ou régler autrement",
  one_off_consumed: "Mandat ponctuel déjà prélevé — un nouveau mandat est nécessaire",
  ambiguous_creditor: "Deux mandats actifs chez deux entités — en révoquer un",
};

/** L'état d'encaissement d'une commande — `due` quand aucun lot ne l'a vue. */
export type OrderCollectionStateView =
  "due" | "batched" | "excluded" | "collected" | "settled_otherwise";

export const ORDER_COLLECTION_STATE_LABELS: Readonly<Record<OrderCollectionStateView, string>> = {
  due: "À prélever",
  batched: "Dans un lot",
  excluded: "Écartée",
  collected: "Prélevée",
  settled_otherwise: "Réglée autrement",
};

export interface CollectionBatchView {
  readonly id: string;
  readonly scheme: "CORE" | "B2B";
  /** ISO — inclusif. */
  readonly cycleStartsAt: string;
  /** ISO — exclusif. */
  readonly cycleClosesAt: string;
  readonly status: CollectionBatchStatusView;
  readonly constitutedAt: string;
  readonly depositedAt: string | null;
  readonly cancelledAt: string | null;
  readonly lineCount: number;
  readonly orderCount: number;
  readonly totalCents: number;
  /** Q2 : non vide = le lot ne se dépose pas, et l'écran les nomme en tête. */
  readonly unmandatedCompanies: readonly string[];
  readonly depositable: boolean;
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
