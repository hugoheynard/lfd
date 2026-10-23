import type { CollectionBatchStatusView } from "./collection-batch.js";
import type { BillingRhythmKind, LocalDeadlineView } from "./legal-entity.js";

/**
 * **La liste des procédures de prélèvement** — l'arrivée de la page du même
 * nom (`GET admin/accounting/collection-procedures?legalEntityId=&includeClosed=`,
 * plan `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * § 11, Hugo 2026-10-23).
 *
 * Une procédure = une CLÔTURE d'une entité ; elle porte ses lots (un par
 * schéma) quand ils existent. Tout est calculé à la lecture, par les mêmes
 * règles que la lecture d'une procédure : rien n'est stocké.
 */

/**
 * `open` : un lot à déposer, un lot déposé encore suivi, ou la dernière
 * clôture sans lot ; `upcoming` : la prochaine clôture d'un rythme suivi ;
 * `closed` : tout est déposé et la fenêtre des retours est close, ou la
 * procédure a été abandonnée (lots annulés) ; `missed` : une clôture passée,
 * plus ancienne que la dernière, que l'automatisme n'a jamais tentée et
 * qu'aucun lot ne couvre — la table la met en tête (Hugo, 2026-10-23).
 */
export type CollectionProcedurePhaseView = "open" | "upcoming" | "closed" | "missed";

/** L'étape en cours : l'onglet qui attend un geste, ou `closed`. */
export type CollectionProcedureStageView = "accounts" | "mandates" | "file" | "returns" | "closed";

/**
 * Un avertissement d'une ligne. Une VALEUR : stable.
 *
 * - `deadline_passed` — la limite de dépôt est passée et rien n'est déposé ;
 * - `deadline_not_set` — le cut-off de l'entité n'est pas réglé ;
 * - `tight_deposit_margin` — moins de deux jours ouvrés avant la limite ;
 * - `accounts_to_export` / `mandates_to_export` — de l'ENTITÉ (P4 absent) ;
 * - `unmandated_debtors` — des débiteurs du lot sans mandat : il ne se dépose pas ;
 * - `pending_returns` — des retours attendent leur geste ;
 * - `missed_closure` — la clôture n'a jamais été préparée (phase `missed`).
 */
export type CollectionProcedureWarningCodeView =
  | "deadline_passed"
  | "deadline_not_set"
  | "tight_deposit_margin"
  | "accounts_to_export"
  | "mandates_to_export"
  | "unmandated_debtors"
  | "pending_returns"
  | "missed_closure";

export interface CollectionProcedureWarningView {
  readonly code: CollectionProcedureWarningCodeView;
  /** Le nombre qu'il compte (comptes, mandats, débiteurs, retours, jours ouvrés) ; `null` sinon. */
  readonly count: number | null;
}

/** Un lot de la procédure, en résumé. */
export interface CollectionProcedureListBatchView {
  readonly id: string;
  readonly scheme: "CORE" | "B2B";
  readonly status: CollectionBatchStatusView;
}

/** Une ligne de la table. */
export interface CollectionProcedureRowView {
  /** Stable : l'entité et le jour de la clôture — il ne change pas quand le lot est préparé. */
  readonly id: string;
  readonly legalEntityId: string;
  /** ISO — la clôture (exclusive). */
  readonly closesAt: string;
  /** `AAAA-MM-JJ` — le jour (Paris) de la clôture, celui que l'écran affiche. */
  readonly closureDay: string;
  /** « du 1er au 31 octobre 2026 », écrit par le serveur. */
  readonly periodLabel: string;
  /** Les rythmes qui closent ici, mensuel d'abord ; vide si aucun n'est connu. */
  readonly modes: readonly BillingRhythmKind[];
  readonly phase: CollectionProcedurePhaseView;
  readonly stage: CollectionProcedureStageView;
  readonly batches: readonly CollectionProcedureListBatchView[];
  /** Le lot que le détail suit par défaut ; `null` sans lot. */
  readonly followedBatchId: string | null;
  /** `AAAA-MM-JJ` — l'échéance du lot suivi, sinon celle du calendrier. */
  readonly collectionDay: string | null;
  readonly depositDeadline: LocalDeadlineView | null;
  /** Le lot suivi est déposé. */
  readonly deposited: boolean;
  readonly warnings: readonly CollectionProcedureWarningView[];
}

/** La table : les manquées d'abord, puis ouvertes et à venir par limite de dépôt, les déposées suivies ensuite, les closes à la fin. */
export interface CollectionProcedureListView {
  readonly legalEntityId: string;
  /** `AAAA-MM-JJ` — aujourd'hui, à Paris. */
  readonly today: string;
  /** `AAAA-MM-JJ` — le premier jour des closes listées ; `null` si elles ne sont pas demandées. */
  readonly closedSince: string | null;
  readonly rows: readonly CollectionProcedureRowView[];
}
