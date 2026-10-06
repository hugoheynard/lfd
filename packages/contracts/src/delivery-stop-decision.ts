import type { DeliveryIncidentView } from "./delivery-doorstep.js";
import type { StaffPermission } from "./staff-access.js";

/**
 * **Le commercial décide** (`documentation/livraisons/a-la-porte.md`,
 * § 9, § 10 B3, § 10 bis « La décision a un propriétaire », LB-Q2, LB-Q5).
 *
 * Un signalement « à la remise » qui dit que le client ne respecte pas les
 * conditions convenues (personne, refus, accès impossible) OUVRE une décision
 * sur l'arrêt. Le commercial y répond — la dernière réponse l'emporte, tant
 * que le livreur n'a pas déposé :
 * - `authorize_deposit` — « Autoriser le dépôt cette fois » : la carte du
 *   livreur propose « Déposé avec preuve » pour CET arrêt, même si la
 *   signature est exigée (LB-Q5 : le commercial l'emporte) ;
 * - `bring_back` — « Rapporter » : l'arrêt se CLÔT « rapporté » (LB-Q2) ; la
 *   commande reste prête, non livrée, et peut repartir dans une autre tournée.
 *
 * Routes (`admin/livraison/a-decider…`, sous `delivery_decisions` — `read`
 * pour les `GET`, `write` pour répondre ; `b2b_companies:write` jusqu'au
 * 2026-10-02) :
 * - `GET` → {@link PendingStopDecisionsView} ;
 * - `POST /:stopId/autoriser-depot` → 204 ;
 * - `POST /:stopId/rapporter` → 204.
 */

/**
 * **Le droit de décider** — `delivery_decisions:write`, sorti de
 * `b2b_companies:write` le 2026-10-02 (lot « correctifs de droits »). Il
 * ouvre les deux réponses, l'écran « À décider », et c'est l'AUDIENCE de la
 * notification « arrêt à décider » (B5).
 *
 * L'audience est l'ÉCRITURE et non la lecture : la notification dit « un
 * livreur attend votre réponse ». La pousser à qui ne peut que lire, c'est
 * réveiller quelqu'un pour un geste qu'il n'a pas le droit de faire — et
 * laisser croire à qui peut répondre qu'un autre s'en occupe.
 */
export const STOP_DECISION_PERMISSION =
  "delivery_decisions:write" as const satisfies StaffPermission;

/** Les deux réponses du commercial. */
export const STOP_DECISION_OUTCOMES = ["authorize_deposit", "bring_back"] as const;
export type StopDecisionOutcome = (typeof STOP_DECISION_OUTCOMES)[number];

/**
 * D'où vient la réponse : un commercial (`staff`, B3), ou un réglage de
 * livraison décidé d'avance (`setting`, B3 bis — pas encore bâti au
 * 2026-10-01 : aucune ligne ne le porte encore).
 */
export const STOP_DECISION_SOURCES = ["staff", "setting"] as const;
export type StopDecisionSource = (typeof STOP_DECISION_SOURCES)[number];

/** Où en est la décision : `pending` tant que personne n'a répondu. */
export type StopDecisionState = "pending" | StopDecisionOutcome;

/** La décision vivante d'un arrêt, telle que les écrans la montrent. */
export interface StopDecisionView {
  readonly state: StopDecisionState;
  /** `null` tant qu'elle est `pending`. */
  readonly source: StopDecisionSource | null;
  /** ISO ; `null` tant qu'elle est `pending`. */
  readonly decidedAt: string | null;
  /** Qui a répondu en dernier ; `null` en attente, ou quand l'annuaire n'en connaissait pas le nom. */
  readonly decidedByName: string | null;
}

/** Un arrêt « À décider » : tournée partie, non rentrée, arrêt ouvert. */
export interface PendingStopDecisionView {
  readonly roundId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly serviceDay: string;
  readonly stopId: string;
  readonly orderId: string;
  /** Le numéro figé au départ ; `""` sans instantané. */
  readonly reference: string;
  readonly customerLabel: string;
  /** La signature exigée, figée au départ — « Autoriser » l'emporte sur elle (LB-Q5). */
  readonly signatureRequired: boolean;
  readonly decision: StopDecisionView;
  /** Les signalements de l'arrêt, du plus ancien au plus récent. */
  readonly incidents: readonly DeliveryIncidentView[];
}

/** La liste « À décider », par jour, tournée et position. */
export interface PendingStopDecisionsView {
  readonly decisions: readonly PendingStopDecisionView[];
}
