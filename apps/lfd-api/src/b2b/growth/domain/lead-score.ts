import type { ActivationView, LeadScoreView, LeadStatus, LeadView } from "@lfd/contracts";

import { deriveActivations } from "./activation.js";
import type { CompanyIdentity } from "./ports/company-namer.js";

/**
 * **Scoring des leads** — le cœur du cockpit « 5 meilleurs coups du jour ».
 * `deriveLeadScores` est une **fonction pure** (testable sans I/O, temps injecté)
 * qui réutilise la projection `deriveActivations` et les leads démarchés, puis
 * attribue à chaque lead **actionnable** un **score 0..100** et une **play**
 * (rescue / nurture).
 *
 * Les **personnes** (le `hot` des anciens prospects, plays lock_in / upgrade /
 * win_back) en sont sorties au lot P3 (2026-10-25,
 * `documentation/b2b/plan-auto-acquisition-pro.md`) : c'étaient des clients
 * particuliers, pas des coups commerciaux.
 *
 * Le score est une **somme pondérée lisible** (poids nommés ci-dessous, décision
 * produit #1) — pas une boîte noire : chaque ligne porte un `reason` qui l'explique.
 * Le read-model matérialisé n'est pas temps réel ; il est intégralement remplacé
 * à chaque recompute cron.
 */

/** Un événement du journal, réduit à ce que le scoring lit. */
export interface LeadEvent {
  readonly type: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly occurredAt: Date;
  readonly actorType: string;
  readonly payload: Record<string, unknown>;
}

// ── Poids & horizons (auditables ; décisions produit #1/#2, ajustables) ────────

/** Poids d'un dossier **société** à secourir (somme = 1). Presque abouti = ROI max. */
const RESCUE_WEIGHTS = { completion: 0.6, urgency: 0.4 } as const;

/** Poids d'un lead **cold** à faire mûrir (somme = 1). Avancement prime la récence. */
const NURTURE_WEIGHTS = { advancement: 0.6, recency: 0.4 } as const;

/** Avancement d'un lead cold dans le pipeline (négo = plein pot, à peine saisi = 0). */
const NURTURE_STAGE_SCORE: Record<string, number> = {
  new: 0,
  contacted: 0.4,
  qualified: 0.7,
  negotiating: 1,
};

/** Statuts cold **actifs** (non clos) — les seuls scorés dans la queue. */
const ACTIVE_LEAD_STATUSES: ReadonlySet<LeadStatus> = new Set<LeadStatus>([
  "new",
  "contacted",
  "qualified",
  "negotiating",
]);

/** Récence à partir de laquelle un lead ne vaut plus rien (jours). */
const RECENCY_HORIZON_DAYS = 60;
/** Blocage à partir duquel l'urgence de rescousse est maximale (jours). */
const STALL_HORIZON_DAYS = 21;

/**
 * Dérive la queue scorée. **Pure et déterministe**. Seuls les leads **actionnables**
 * entrent : dossiers d'activation **pending** (journal) et leads démarchés
 * **actifs** (agrégat, play `nurture`). Trie par score décroissant, le plus frais
 * départageant à score égal.
 *
 * Les leads démarchés viennent d'un **agrégat** (pas du journal) : on ne
 * reconstruit jamais leur état depuis les événements — le read-model les lit à
 * la source (`LeadReader`).
 *
 * `companyNames` nomme les dossiers d'activation. Le libellé est **persisté**
 * dans `lead_score.label` et relu tel quel par l'écran : sans annuaire ici, une
 * résolution côté front laisserait la valeur fausse en base, et le prochain
 * lecteur la réafficherait.
 */
export function deriveLeadScores(
  events: readonly LeadEvent[],
  now: Date,
  coldLeads: readonly LeadView[] = [],
  companyNames: ReadonlyMap<string, CompanyIdentity> = new Map(),
): LeadScoreView[] {
  const computedAt = now.toISOString();
  const companyEvents = events.filter((event) => event.subjectType === "company");

  const leads: LeadScoreView[] = [];
  for (const activation of deriveActivations(companyEvents, now, companyNames)) {
    if (activation.status === "pending") {
      leads.push(scoreActivation(activation, computedAt));
    }
  }
  for (const cold of coldLeads) {
    if (ACTIVE_LEAD_STATUSES.has(cold.status)) {
      leads.push(scoreColdLead(cold, now, computedAt));
    }
  }
  return leads.sort(byScoreThenRecency);
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
    // Le repli sur l'identifiant ne tient plus qu'au cas où la société a
    // disparu de la base entre deux recomputes — une ligne qu'on ne pourrait
    // de toute façon pas appeler.
    label: activation.companyName ?? activation.companyId,
    play: "rescue",
    score,
    reason: `Dossier ${activation.stepsReached.length}/4 pièces, bloqué depuis ${stalledDays} j`,
    recencyDays: stalledDays,
    computedAt,
  };
}

/** Libellé FR d'une étape de pipeline cold, pour le `reason`. */
const NURTURE_STAGE_LABEL: Record<string, string> = {
  new: "à contacter",
  contacted: "contacté",
  qualified: "qualifié",
  negotiating: "en négociation",
};

/** Scoring d'un lead **cold** actif → play `nurture` (avancement × récence). */
function scoreColdLead(lead: LeadView, now: Date, computedAt: string): LeadScoreView {
  const anchor = new Date(lead.lastContactedAt ?? lead.createdAt);
  const recencyDays = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / DAY_MS));
  const advancement = NURTURE_STAGE_SCORE[lead.status] ?? 0;
  const recency = clamp01(1 - recencyDays / RECENCY_HORIZON_DAYS);
  const score = Math.round(
    (NURTURE_WEIGHTS.advancement * advancement + NURTURE_WEIGHTS.recency * recency) * 100,
  );
  return {
    subjectType: "lead",
    subjectId: lead.id,
    label: lead.businessName,
    play: "nurture",
    score,
    reason: `Démarchage ${NURTURE_STAGE_LABEL[lead.status] ?? lead.status} · relance depuis ${recencyDays} j`,
    recencyDays,
    computedAt,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

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
