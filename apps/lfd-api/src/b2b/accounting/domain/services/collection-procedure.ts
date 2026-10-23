import type { LocalDeadline } from "./collection-calendar.js";
import { businessDaysAfter } from "./target2-calendar.js";
import {
  isDeadBatchStatus,
  type CollectionBatchStatus,
} from "../entities/collection-batch-status.js";

/**
 * **L'état de la procédure de prélèvement** — les quatre onglets de la page,
 * calculés depuis l'état réel (plan
 * `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * § 1 et § 3). Pur : le jour de Paris est donné, rien n'est lu ni stocké.
 *
 * Ce qui n'y est pas encore, et c'est voulu : les attestations (P3) — l'onglet
 * 3 est donc « fait » au dépôt, sans la signature attestée — et le verrou de
 * l'onglet 3 par débiteur du lot (P4) — l'onglet 3 ne se verrouille pas sur
 * l'onglet 2, il avertit.
 */

/** Les quatre états d'un onglet (§ 3). */
export type ProcedureStepState = "locked" | "to_do" | "waiting" | "done";

/** N de l'onglet 4 : on suit un lot jusqu'à échéance + 5 jours ouvrés (Q3, Hugo, 2026-10-23). */
export const RETURNS_WATCH_BUSINESS_DAYS = 5;

/** Un lot, tel que la procédure le lit. */
export interface ProcedureBatch {
  readonly id: string;
  readonly scheme: "CORE" | "B2B";
  readonly status: CollectionBatchStatus;
  /** ISO — exclusive. */
  readonly cycleClosesAt: string;
  readonly requestedCollectionDay: string | null;
  readonly depositDeadline: LocalDeadline | null;
  readonly pendingReturnCount: number;
}

/** Onglet 1 (§ 3.1) : à exporter, sinon en vol, sinon fait. */
export function accountsState(toExportCount: number, inFlightCount: number): ProcedureStepState {
  if (toExportCount > 0) {
    return "to_do";
  }
  return inFlightCount > 0 ? "waiting" : "done";
}

/**
 * Onglet 2 (§ 3.2) : verrouillé ENTIER tant que l'onglet 1 n'est pas fait —
 * la banque refuse un mandat dont le compte lui est inconnu, et le serveur ne
 * sait pas encore le dire mandat par mandat.
 */
export function mandatesState(
  accounts: ProcedureStepState,
  toExportCount: number,
  awaitingImport: boolean,
): ProcedureStepState {
  if (accounts !== "done") {
    return "locked";
  }
  if (awaitingImport) {
    return "waiting";
  }
  return toExportCount > 0 ? "to_do" : "done";
}

export type FileReason =
  "no_batch" | "to_prepare" | "cancelled" | "rejected_by_bank" | "to_deposit" | "deposited";

/** Onglet 3 (§ 3.3), sans attestation ni verrou par débiteur (P2). */
export function fileStatus(
  followed: ProcedureBatch | null,
  toPrepare: boolean,
): { readonly state: ProcedureStepState; readonly reason: FileReason } {
  if (followed === null) {
    return toPrepare
      ? { state: "to_do", reason: "to_prepare" }
      : { state: "done", reason: "no_batch" };
  }
  if (followed.status === "cancelled" || followed.status === "rejected_by_bank") {
    // Un lot rejeté par la banque se prépare de nouveau, comme un lot annulé.
    return { state: "to_do", reason: followed.status };
  }
  return followed.status === "constituted"
    ? { state: "to_do", reason: "to_deposit" }
    : { state: "done", reason: "deposited" };
}

export type ReturnsReason =
  "not_deposited" | "before_collection_day" | "pending_returns" | "watching" | "watch_over";

export interface ReturnsStatus {
  readonly state: ProcedureStepState;
  readonly reason: ReturnsReason;
  readonly watchUntilDay: string | null;
}

/**
 * Onglet 4 (§ 3.4) : verrouillé par le DÉPÔT seul — jamais par une
 * attestation, qui fermerait l'import des impayés d'un lot réellement débité.
 * Sans le contrôle quotidien attesté (P3), la fenêtre [échéance, échéance + N]
 * est « à faire » chaque jour ; un retour en suspens la rouvre après.
 */
export function returnsStatus(followed: ProcedureBatch | null, today: string): ReturnsStatus {
  if (followed?.status !== "deposited") {
    return { state: "locked", reason: "not_deposited", watchUntilDay: null };
  }
  const collectionDay = followed.requestedCollectionDay;
  const watchUntilDay =
    collectionDay === null ? null : businessDaysAfter(collectionDay, RETURNS_WATCH_BUSINESS_DAYS);
  if (followed.pendingReturnCount > 0) {
    return { state: "to_do", reason: "pending_returns", watchUntilDay };
  }
  if (collectionDay !== null && today < collectionDay) {
    return { state: "waiting", reason: "before_collection_day", watchUntilDay };
  }
  if (watchUntilDay !== null && today <= watchUntilDay) {
    return { state: "to_do", reason: "watching", watchUntilDay };
  }
  return { state: "done", reason: "watch_over", watchUntilDay };
}

/** Un lot déposé dont l'onglet 4 n'est pas fait — encore suivi. */
function stillWatched(batch: ProcedureBatch, today: string): boolean {
  return batch.status === "deposited" && returnsStatus(batch, today).state !== "done";
}

/**
 * La clé d'urgence d'un lot : sa limite de dépôt, à défaut son échéance, à
 * défaut sa clôture — des chaînes qui se comparent dans l'ordre du temps.
 */
function urgencyOf(batch: ProcedureBatch): string {
  if (batch.depositDeadline !== null) {
    return `${batch.depositDeadline.day}T${batch.depositDeadline.time}`;
  }
  return batch.requestedCollectionDay ?? batch.cycleClosesAt;
}

function byUrgency(left: ProcedureBatch, right: ProcedureBatch): number {
  return urgencyOf(left).localeCompare(urgencyOf(right));
}

/**
 * Les lots ouverts (Q4) : à déposer d'abord, la limite la plus proche en tête
 * — une limite ne se rattrape pas —, puis les déposés encore suivis.
 */
export function openBatchesOf<T extends ProcedureBatch>(
  batches: readonly T[],
  today: string,
): readonly T[] {
  return [
    ...batches.filter((batch) => batch.status === "constituted").sort(byUrgency),
    ...batches.filter((batch) => stillWatched(batch, today)).sort(byUrgency),
  ];
}

/**
 * Le lot suivi par défaut (§ 4.3) : le lot à déposer dont la limite est la
 * plus proche ; sinon, si la dernière clôture attend son lot (`toPrepare`),
 * aucun — l'onglet 3 propose de le préparer ; sinon le déposé le plus urgent
 * encore suivi. Le dépôt passe avant le suivi des retours.
 */
export function followedBatchOf<T extends ProcedureBatch>(
  batches: readonly T[],
  today: string,
  toPrepare: boolean,
): T | null {
  const first = openBatchesOf(batches, today)[0] ?? null;
  if (first?.status === "constituted") {
    return first;
  }
  return toPrepare ? null : first;
}

/**
 * Le lot suivi d'UNE clôture (la procédure de la liste, § 11) : la règle du
 * § 4.3 sur ses seuls lots ; une procédure close ou abandonnée se relit sur
 * son lot vivant, sinon sur son dernier annulé. `batches` : le plus récent
 * d'abord, comme `CollectionBatchReader.list`.
 */
export function followedAtClosure<T extends ProcedureBatch>(
  batches: readonly T[],
  today: string,
  toPrepare: boolean,
): T | null {
  const first = followedBatchOf(batches, today, toPrepare);
  if (first !== null || toPrepare) {
    return first;
  }
  return batches.find((batch) => !isDeadBatchStatus(batch.status)) ?? batches[0] ?? null;
}

/**
 * Le lot de la même clôture et du même schéma, préparé de nouveau après
 * l'annulation de celui-ci (§ 2) ; `null` s'il ne l'a pas été.
 */
export function replacementOf(
  cancelled: ProcedureBatch,
  batches: readonly ProcedureBatch[],
): ProcedureBatch | null {
  return (
    batches.find(
      (batch) =>
        !isDeadBatchStatus(batch.status) &&
        batch.scheme === cancelled.scheme &&
        batch.cycleClosesAt === cancelled.cycleClosesAt,
    ) ?? null
  );
}

export type ProcedureStepKey = "accounts" | "mandates" | "file" | "returns";

/**
 * L'onglet ouvert à l'arrivée (§ 1) : le premier qui attend un geste, à
 * faire ou en attente ; le premier sinon.
 */
export function arrivalStepOf(
  states: Readonly<Record<ProcedureStepKey, ProcedureStepState>>,
): ProcedureStepKey {
  const order: readonly ProcedureStepKey[] = ["accounts", "mandates", "file", "returns"];
  return order.find((key) => states[key] === "to_do" || states[key] === "waiting") ?? "accounts";
}
