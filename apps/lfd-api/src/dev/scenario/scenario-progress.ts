import type { DevScenarioStep, DevScenarioStepView } from "@lfd/contracts";

/**
 * **Où en est le scénario du jour**, déduit de ce que la base porte — jamais
 * d'une étape mémorisée (`documentation/order/plan-jeu-de-donnees-par-etapes.md`
 * §2 : une base modifiée à la main donne l'étape réellement atteinte).
 *
 * Pur : les faits sont lus ailleurs (`scenario-facts.reader.ts`), et la
 * déduction se teste sans base.
 */

/** Ce que la base porte pour la journée du scénario, compté. */
export interface ScenarioFacts {
  /** Étape 0 — les commandes du jour retrouvées par leur clé, sur celles que le scénario pose. */
  readonly placed: {
    readonly expected: number;
    readonly found: number;
    readonly deliveries: number;
    readonly pickups: number;
  };
  /** Étape 1 — le plan du soir, et ce qu'il a absorbé. */
  readonly plan: { readonly closed: boolean; readonly orders: number };
  /** Étape 2 — les livraisons que le scénario met en tournée, et celles qui y sont. */
  readonly composed: { readonly expected: number; readonly assigned: number };
  /** Étape 3 — les articles du compte, et ceux dont les fournées couvrent le compte. */
  readonly production: { readonly items: number; readonly done: number };
  /** Étape 4 — les commandes prévues au colisage, et celles qui y sont fermées. */
  readonly packing: { readonly expected: number; readonly packed: number; readonly left: number };
  /** Étape 5 — les tournées du jour, les bacs de leurs arrêts, et ceux qui sont chargés. */
  readonly rounds: { readonly rounds: number; readonly bins: number; readonly loaded: number };
}

/** Les étapes, dans l'ordre. */
export const SCENARIO_STEPS: readonly DevScenarioStep[] = [0, 1, 2, 3, 4, 5];

/** Chaque étape, vraie ou non en base — indépendamment des autres. */
function holds(facts: ScenarioFacts): Readonly<Record<DevScenarioStep, boolean>> {
  const { placed, plan, composed, production, packing, rounds } = facts;
  return {
    0: placed.expected > 0 && placed.found === placed.expected,
    1: plan.closed,
    2: rounds.rounds > 0 && composed.expected > 0 && composed.assigned === composed.expected,
    3: production.items > 0 && production.done === production.items,
    4: packing.expected > 0 && packing.packed === packing.expected,
    5: rounds.rounds > 0 && rounds.bins > 0 && rounds.loaded === rounds.bins,
  };
}

/**
 * **L'étape atteinte** : la dernière d'une suite d'étapes toutes vraies depuis
 * la première. Une étape vraie après une étape fausse ne compte pas — des bacs
 * chargés sans plan arrêté ne sont pas « l'étape 5 ». `null` : les commandes du
 * jour ne sont pas (ou plus toutes) là.
 */
export function reachedStep(facts: ScenarioFacts): DevScenarioStep | null {
  const truth = holds(facts);
  let reached: DevScenarioStep | null = null;
  for (const step of SCENARIO_STEPS) {
    if (!truth[step]) {
      break;
    }
    reached = step;
  }
  return reached;
}

/** Les six étapes, cochées jusqu'à l'étape atteinte, chacune avec son résumé. */
export function stepViews(facts: ScenarioFacts): readonly DevScenarioStepView[] {
  const reached = reachedStep(facts);
  return SCENARIO_STEPS.map((step) => ({
    step,
    reached: reached !== null && step <= reached,
    summary: SUMMARIES[step](facts),
  }));
}

/** « 1 tournée », « 3 tournées ». */
function count(value: number, one: string, many: string): string {
  return `${String(value)} ${value > 1 ? many : one}`;
}

const SUMMARIES: Readonly<Record<DevScenarioStep, (facts: ScenarioFacts) => string>> = {
  0: ({ placed }) =>
    `${String(placed.found)} sur ${String(placed.expected)} commandes du jour — ` +
    `${count(placed.deliveries, "livraison", "livraisons")}, ` +
    `${count(placed.pickups, "retrait", "retraits")} au comptoir`,
  1: ({ plan }) =>
    plan.closed
      ? `plan arrêté, ${count(plan.orders, "commande", "commandes")} au plan`
      : "plan du jour pas encore arrêté",
  2: ({ composed, rounds }) =>
    `${count(rounds.rounds, "tournée", "tournées")}, ` +
    `${String(composed.assigned)} sur ${count(composed.expected, "livraison placée", "livraisons placées")}`,
  3: ({ production }) =>
    `${String(production.done)} sur ${count(production.items, "article sorti", "articles sortis")} du four`,
  4: ({ packing }) =>
    `${String(packing.packed)} sur ${count(packing.expected, "commande prête", "commandes prêtes")}, ` +
    `${String(packing.left)} laissée(s) hors colisage`,
  5: ({ rounds }) =>
    `${count(rounds.rounds, "tournée", "tournées")}, ` +
    `${String(rounds.loaded)} sur ${count(rounds.bins, "bac chargé", "bacs chargés")}`,
};
