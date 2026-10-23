import type { CollectionBatchStatusView } from "./collection-batch.js";
import type { BillingRhythmKind, LocalDeadlineView } from "./legal-entity.js";

/**
 * **La procédure de prélèvement**, telle que la page du même nom la lit
 * (`GET admin/accounting/collection-procedure`, plan
 * `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`, S1).
 *
 * L'état de chaque onglet est CALCULÉ par le serveur à chaque lecture depuis
 * les exports, les lots et les retours : rien n'est stocké, pas même l'onglet
 * courant (§ 1). Les attestations (P3) et le verrou par débiteur du lot (P4)
 * n'y sont pas encore.
 */

/** L'état d'un onglet (§ 3). Une VALEUR : stable. */
export type CollectionProcedureStepStateView = "locked" | "to_do" | "waiting" | "done";

/** Les quatre onglets, dans l'ordre de la procédure. */
export type CollectionProcedureStepKeyView = "accounts" | "mandates" | "file" | "returns";

/** Onglet 1 — les comptes destinataires à la banque (l'entité). */
export interface CollectionProcedureAccountsView {
  readonly state: CollectionProcedureStepStateView;
  readonly toExportCount: number;
  /** Préparés, ni importés ni abandonnés. */
  readonly inFlightCount: number;
  /** Sans BIC : aucun geste de l'onglet ne les résout. */
  readonly excludedCount: number;
}

/** Onglet 2 — les mandats à la banque (l'entité). */
export interface CollectionProcedureMandatesView {
  readonly state: CollectionProcedureStepStateView;
  /** Pas encore importés sous leur compte actuel — export en vol compris. */
  readonly toExportCount: number;
  /** Un export attend « Marquer importé » ou « Abandonner ». */
  readonly awaitingImport: boolean;
  readonly excludedCount: number;
}

/**
 * Pourquoi l'onglet 3 est dans son état : `no_batch` (rien à préparer ni à
 * déposer), `to_prepare` (la dernière clôture n'a pas de lot), `cancelled`
 * (le lot demandé a été annulé), `rejected_by_bank` (son fichier a été
 * rejeté par la banque après dépôt : à préparer de nouveau), `to_deposit`,
 * `deposited`.
 */
export type CollectionProcedureFileReasonView =
  "no_batch" | "to_prepare" | "cancelled" | "rejected_by_bank" | "to_deposit" | "deposited";

/** Onglet 3 — le fichier du lot suivi. */
export interface CollectionProcedureFileView {
  readonly state: CollectionProcedureStepStateView;
  readonly reason: CollectionProcedureFileReasonView;
  /**
   * Mandats de l'ENTITÉ pas encore importés sous leur compte actuel. Jusqu'au
   * lot P4 (S2), le serveur ne sait pas lesquels sont des débiteurs du lot :
   * l'onglet avertit, il ne verrouille pas (§ 3.3).
   */
  readonly mandatesNotImportedCount: number;
  /** Mandats de l'entité écartés de l'export. */
  readonly excludedMandateCount: number;
  /** Comptes de l'entité écartés (sans BIC). */
  readonly excludedAccountCount: number;
  /**
   * Jours ouvrés TARGET2 entre la préparation du lot suivi et sa limite de
   * dépôt, quand il y en a MOINS de deux (Hugo, 2026-10-23) ; `null` sinon,
   * ou si la limite n'est pas renseignée. Un avertissement, jamais un refus.
   */
  readonly tightDepositMargin: number | null;
}

/**
 * Pourquoi l'onglet 4 est dans son état : `not_deposited` (verrouillé),
 * `before_collection_day` (rien à contrôler avant l'échéance),
 * `pending_returns` (un retour attend son geste), `watching` (contrôle
 * quotidien jusqu'à `watchUntilDay`), `watch_over` (fenêtre close).
 */
export type CollectionProcedureReturnsReasonView =
  "not_deposited" | "before_collection_day" | "pending_returns" | "watching" | "watch_over";

/** Onglet 4 — le contrôle des retours du lot suivi. */
export interface CollectionProcedureReturnsView {
  readonly state: CollectionProcedureStepStateView;
  readonly reason: CollectionProcedureReturnsReasonView;
  readonly pendingReturnCount: number;
  /** `AAAA-MM-JJ` — échéance + 5 jours ouvrés (Q3) ; `null` sans échéance figée. */
  readonly watchUntilDay: string | null;
}

/** Un lot, tel que la tête de la page le liste. */
export interface CollectionProcedureBatchView {
  readonly id: string;
  /** La procédure (entité × clôture) que ce lot porte — l'adresse de son détail. */
  readonly procedureId: string;
  readonly scheme: "CORE" | "B2B";
  /** « du 1er au 31 octobre 2026 » — la période que ferme la clôture du lot, écrite par le serveur. */
  readonly periodLabel: string;
  /**
   * Les rythmes des clients que le lot prélève, mensuel d'abord — PLUSIEURS
   * quand une même clôture en réunit (une fin de mois commune au mensuel et
   * au « deux fois par mois »). Même calcul que « Prélèvement du mois ».
   */
  readonly payerModes: readonly BillingRhythmKind[];
  readonly status: CollectionBatchStatusView;
  /** `AAAA-MM-JJ`, ou `null` pour un lot d'avant le 2026-10-08. */
  readonly requestedCollectionDay: string | null;
  readonly depositDeadline: LocalDeadlineView | null;
  readonly cancelledAt: string | null;
  /** L'instant du rejet déclaré par la banque ; `null` sinon. */
  readonly rejectedAt: string | null;
}

/** La dernière clôture du calendrier, sans lot préparé. */
export interface CollectionProcedureToPrepareView {
  /** La procédure (entité × clôture) de cette clôture. */
  readonly procedureId: string;
  /** ISO — exclusive. */
  readonly closesAt: string;
  readonly periodLabel: string;
}

/**
 * La clôture de l'adresse est **manquée** (R4b) : jamais tentée par
 * l'automatisme, couverte par aucun lot. Son lot ne se prépare pas pour
 * elle : « Préparer » ne prépare que la dernière clôture, et ce lot-là
 * reprend les commandes de la période manquée.
 */
export interface CollectionProcedureMissedView {
  /** ISO — la clôture manquée (exclusive). */
  readonly closesAt: string;
  readonly periodLabel: string;
  /** La procédure de la dernière clôture, celle dont le lot se prépare. */
  readonly latestProcedureId: string;
  readonly latestPeriodLabel: string;
}

/** Les clients d'un rythme parmi ceux que les lots de la procédure prélèvent. */
export interface CollectionProcedurePayerCountView {
  readonly mode: BillingRhythmKind;
  readonly count: number;
}

/** La procédure elle-même : sa clôture, son code, ses rythmes (ajouté le 2026-10-23). */
export interface CollectionProcedureIdentityView {
  /** `PRL-<AAMMJJ>-<rythmes>`. */
  readonly code: string;
  /** `AAAA-MM-JJ` — le jour (Paris) de la clôture. */
  readonly closureDay: string;
  /** Les rythmes de la procédure qui ont des clients (`procedureRhythms`) ; deux ou plus : mutualisée. */
  readonly closureModes: readonly BillingRhythmKind[];
  /**
   * Les clients prélevés par rythme, lus des factures des lots non annulés
   * de la clôture (le mode sous lequel chacun a clos SA période) ; `null`
   * tant qu'aucun lot n'est préparé.
   */
  readonly payerCounts: readonly CollectionProcedurePayerCountView[] | null;
}

/** `GET admin/accounting/collection-procedure?legalEntityId=&batchId=`. */
export interface CollectionProcedureView {
  readonly legalEntityId: string;
  /** La procédure ouverte ; `null` quand l'entité n'a aucune clôture à montrer. */
  readonly procedure: CollectionProcedureIdentityView | null;
  /**
   * Les lots de CETTE procédure (CORE et B2B), annulés compris, la limite de
   * dépôt la plus proche d'abord — l'onglet 3 les montre tous (2026-10-23).
   */
  readonly procedureBatches: readonly CollectionProcedureBatchView[];
  /** Le lot que suivent les onglets 3 et 4 (§ 4.3), ou celui de l'adresse. */
  readonly followed: CollectionProcedureBatchView | null;
  /**
   * Le lot suivi est annulé : celui de la même clôture et du même schéma
   * préparé de nouveau, s'il existe (§ 2). `null` sinon.
   */
  readonly replacementBatchId: string | null;
  readonly toPrepare: CollectionProcedureToPrepareView | null;
  /** La clôture de l'adresse est manquée ; `null` sinon. */
  readonly missed: CollectionProcedureMissedView | null;
  /** Tous les lots ouverts, la limite de dépôt la plus proche d'abord (Q4). */
  readonly openBatches: readonly CollectionProcedureBatchView[];
  readonly accounts: CollectionProcedureAccountsView;
  readonly mandates: CollectionProcedureMandatesView;
  readonly file: CollectionProcedureFileView;
  readonly returns: CollectionProcedureReturnsView;
  /** L'onglet ouvert à l'arrivée : le premier qui attend un geste. */
  readonly arrivalStep: CollectionProcedureStepKeyView;
}
