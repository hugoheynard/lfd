import type { LeadScoreView, MomentumTrajectory, PlayType } from "@lfd/contracts";

import { ACTIVITY_TYPES } from "./activity-event.js";
import { deriveActivations } from "./activation.js";
import { deriveProspects } from "./prospect.js";
import type { ActivationView, ProspectView } from "@lfd/contracts";

/**
 * **Scoring des leads** — le cœur du cockpit « 5 meilleurs coups du jour ».
 * `deriveLeadScores` est une **fonction pure** (testable sans I/O, temps injecté)
 * qui réutilise les projections `deriveProspects` / `deriveActivations`, enrichit
 * du signal d'abonnement, puis attribue à chaque lead **actionnable** un **score
 * 0..100** et une **play** (lock_in / rescue / upgrade / win_back).
 *
 * Le score est une **somme pondérée lisible** (poids nommés ci-dessous, décision
 * produit #1) — pas une boîte noire : chaque ligne porte un `reason` qui l'explique.
 * Le read-model matérialisé n'est pas temps réel ; il est intégralement remplacé
 * à chaque recompute cron.
 */

/** Un événement du journal, réduit à ce que le scoring lit (superset des deux projections). */
export interface LeadEvent {
  readonly type: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly occurredAt: Date;
  readonly actorType: string;
  readonly payload: Record<string, unknown>;
}

// ── Poids & horizons (auditables ; décisions produit #1/#2, ajustables) ────────

/** Poids d'un lead **personne** (somme = 1). Récence prime, puis fréquence/montant. */
const PROSPECT_WEIGHTS = {
  recency: 0.3,
  frequency: 0.25,
  monetary: 0.2,
  momentum: 0.15,
  recurrence: 0.1,
} as const;

/** Poids d'un dossier **société** à secourir (somme = 1). Presque abouti = ROI max. */
const RESCUE_WEIGHTS = { completion: 0.6, urgency: 0.4 } as const;

/** Récence à partir de laquelle un lead ne vaut plus rien (jours). */
const RECENCY_HORIZON_DAYS = 60;
/** Nombre de commandes qui sature le score de fréquence. */
const FREQUENCY_TARGET = 8;
/** Montant (centimes) qui sature le score monétaire (1000 €). */
const MONETARY_TARGET_CENTS = 100_000;
/** Blocage à partir duquel l'urgence de rescousse est maximale (jours). */
const STALL_HORIZON_DAYS = 21;

/** Contribution du momentum au score (accélère = plein pot, dormant = zéro). */
const MOMENTUM_SCORE: Record<MomentumTrajectory, number> = {
  accelerating: 1,
  stable: 0.6,
  cooling: 0.3,
  dormant: 0,
};

/** Libellé court du momentum pour le `reason`. */
const MOMENTUM_LABEL: Record<MomentumTrajectory, string> = {
  accelerating: "accélère",
  stable: "stable",
  cooling: "refroidit",
  dormant: "dormant",
};

/**
 * Dérive la queue scorée d'un flux d'événements. **Pure et déterministe**. Seuls
 * les leads **actionnables** entrent dans la queue : les prospects **hot** (une
 * play à jouer maintenant) et les dossiers d'activation **pending** (à secourir).
 * Les `mid` (inscrits sans commande) vivent dans l'onglet Prospects, pas ici.
 * Trie par score décroissant, le plus frais départageant à score égal.
 */
export function deriveLeadScores(events: readonly LeadEvent[], now: Date): LeadScoreView[] {
  const computedAt = now.toISOString();
  const subscribers = subscriberUserIds(events);
  const userEvents = events.filter((event) => event.subjectType === "user");
  const companyEvents = events.filter((event) => event.subjectType === "company");

  const leads: LeadScoreView[] = [];
  for (const prospect of deriveProspects(userEvents, now)) {
    if (prospect.temperature === "hot") {
      leads.push(scoreProspect(prospect, subscribers.has(prospect.subjectId), computedAt));
    }
  }
  for (const activation of deriveActivations(companyEvents, now)) {
    if (activation.status === "pending") {
      leads.push(scoreActivation(activation, computedAt));
    }
  }
  return leads.sort(byScoreThenRecency);
}

/** Les personnes ayant au moins un `subscription.created` (récurrence = engagement). */
function subscriberUserIds(events: readonly LeadEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === ACTIVITY_TYPES.subscriptionCreated) {
      ids.add(event.subjectId);
    }
  }
  return ids;
}

/** Scoring d'un lead **personne** (hot) → play + score pondéré + reason. */
function scoreProspect(
  prospect: ProspectView,
  hasSubscription: boolean,
  computedAt: string,
): LeadScoreView {
  const play = prospectPlay(prospect, hasSubscription);
  return {
    subjectType: "user",
    subjectId: prospect.subjectId,
    label: prospect.email === "" ? prospect.subjectId : prospect.email,
    play,
    score: prospectScore(prospect, hasSubscription),
    reason: prospectReason(prospect, play),
    momentum: prospect.momentum,
    monetaryCents: prospect.totalCents,
    recencyDays: prospect.recencyDays,
    computedAt,
  };
}

/**
 * Play d'un lead personne : abonné → **upgrade** (étendre le compte) ; sinon un
 * rythme qui faiblit → **win_back** ; sinon → **lock_in** (verrouiller par un
 * premier abonnement).
 */
function prospectPlay(prospect: ProspectView, hasSubscription: boolean): PlayType {
  if (hasSubscription) {
    return "upgrade";
  }
  if (prospect.momentum === "cooling" || prospect.momentum === "dormant") {
    return "win_back";
  }
  return "lock_in";
}

/** Somme pondérée 0..100 (récence × fréquence × montant × momentum × récurrence). */
function prospectScore(prospect: ProspectView, hasSubscription: boolean): number {
  const recency = clamp01(1 - prospect.recencyDays / RECENCY_HORIZON_DAYS);
  const frequency = clamp01(prospect.orderCount / FREQUENCY_TARGET);
  const monetary = clamp01(prospect.totalCents / MONETARY_TARGET_CENTS);
  const raw =
    PROSPECT_WEIGHTS.recency * recency +
    PROSPECT_WEIGHTS.frequency * frequency +
    PROSPECT_WEIGHTS.monetary * monetary +
    PROSPECT_WEIGHTS.momentum * MOMENTUM_SCORE[prospect.momentum] +
    PROSPECT_WEIGHTS.recurrence * (hasSubscription ? 1 : 0);
  return Math.round(raw * 100);
}

/** Justification courte et déterministe d'un lead personne. */
function prospectReason(prospect: ProspectView, play: PlayType): string {
  const euros = Math.round(prospect.totalCents / 100);
  const base = `${prospect.orderCount} cmd · ${euros} € · ${MOMENTUM_LABEL[prospect.momentum]}`;
  if (play === "upgrade") {
    return `${base} · déjà abonné → étendre`;
  }
  if (play === "win_back") {
    return `${base} · silencieux depuis ${prospect.recencyDays} j`;
  }
  return `${base} · pas encore d'abonnement`;
}

/** Scoring d'un dossier **société** bloqué → play `rescue` + urgence pondérée. */
function scoreActivation(activation: ActivationView, computedAt: string): LeadScoreView {
  const stalledDays = activation.stalledDays ?? 0;
  const completion = clamp01(activation.completion);
  const urgency = clamp01(stalledDays / STALL_HORIZON_DAYS);
  const score = Math.round(
    (RESCUE_WEIGHTS.completion * completion + RESCUE_WEIGHTS.urgency * urgency) * 100,
  );
  return {
    subjectType: "company",
    subjectId: activation.companyId,
    label: activation.companyId,
    play: "rescue",
    score,
    reason: `Dossier ${activation.stepsReached.length}/4 pièces, bloqué depuis ${stalledDays} j`,
    momentum: null,
    monetaryCents: 0,
    recencyDays: stalledDays,
    computedAt,
  };
}

/** Score décroissant ; à score égal, le plus récemment actif d'abord. */
function byScoreThenRecency(a: LeadScoreView, b: LeadScoreView): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  return a.recencyDays - b.recencyDays;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
