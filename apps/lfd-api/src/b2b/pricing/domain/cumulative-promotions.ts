import { compareExact, roundToCents, type Exact } from "@lfd/money";

import type { PriceRule, PriceStep, PricingContext, RejectedRule } from "./price-rule.js";
import { applyRule, mostAdvantageous, rejectionOf } from "./price-rule-application.js";
import { compareSpecificity, winnerOf } from "./specificity.js";

/** Ce que l'étage rend : le prix sortant, exact, ses étapes, ses écartées. */
export interface PromotionStageOutcome {
  readonly running: Exact;
  readonly steps: readonly PriceStep[];
  readonly rejected: readonly RejectedRule[];
}

/** La promotion porte-t-elle la case « Cumulable » ? */
export function isCumulative(rule: PriceRule): boolean {
  return rule.cumulative === true;
}

/**
 * **L'étage `promotion` quand une promotion CUMULABLE s'applique** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 16 et § 16.1) — pur, en exact.
 *
 * 1. Les non cumulables désignent leur gagnant comme aujourd'hui (`winnerOf` :
 *    spécificité, puis la plus avantageuse, puis l'id) ;
 * 2. les cumulables forment une chaîne — la plus spécifique d'abord, puis
 *    l'id —, chacune appliquée au prix sortant de la précédente (20 % puis
 *    15 % = −32 %), sans arrondi intermédiaire ;
 * 3. le gagnant et la chaîne se comparent sur le prix sortant : le plus bas
 *    l'emporte, et à égalité le gagnant non cumulable (l'existant) ;
 * 4. le scellement d'une mercuriale se juge par règle : une cumulable sans
 *    `stacksOverMercuriale` est écartée `sealed`, la chaîne continue sans elle.
 *
 * Le plancher n'est pas ici : il s'applique au prix final, après tous les
 * étages, et arrête donc la descente quel que soit le nombre d'étapes.
 *
 * N'est appelé QUE si une cumulable est applicable : sans elle, l'étage suit
 * le chemin d'avant, intact — l'égalité au centime des prix existants (§ 16.1).
 */
export function resolveCumulativeStage(
  applicable: readonly PriceRule[],
  context: PricingContext,
  entering: Exact,
  sealed: boolean,
): PromotionStageOutcome {
  const sealedOut = (rule: PriceRule): boolean => sealed && !rule.stacksOverMercuriale;
  const rejected: RejectedRule[] = [];

  const single = singleWinner(applicable, context, entering, sealedOut, rejected);
  const chain = chainOf(applicable, context, entering, sealedOut, rejected);
  const last = chain.at(-1);

  if (last === undefined) {
    return outcome(
      single === null ? entering : single.result,
      single === null ? [] : [single],
      rejected,
    );
  }
  if (single !== null && compareExact(single.result, last.result) <= 0) {
    rejected.push(...chain.map((entry) => rejectionOf(entry.rule, "superseded")));
    return outcome(single.result, [single], rejected);
  }
  if (single !== null) {
    rejected.push(rejectionOf(single.rule, "superseded"));
  }
  return outcome(last.result, chain, rejected);
}

interface Applied {
  readonly rule: PriceRule;
  readonly result: Exact;
}

/** Le gagnant des non cumulables, ou `null` ; ses perdants sont consignés. */
function singleWinner(
  applicable: readonly PriceRule[],
  context: PricingContext,
  entering: Exact,
  sealedOut: (rule: PriceRule) => boolean,
  rejected: RejectedRule[],
): Applied | null {
  const candidates = applicable.filter((rule) => !isCumulative(rule));
  const winner = winnerOf(candidates, context, (left, right) =>
    mostAdvantageous(left, right, entering),
  );
  if (winner === null) {
    return null;
  }
  for (const loser of candidates.filter((rule) => rule.id !== winner.id)) {
    rejected.push(rejectionOf(loser, "superseded"));
  }
  if (sealedOut(winner)) {
    rejected.push(rejectionOf(winner, "sealed"));
    return null;
  }
  return { rule: winner, result: applyRule(entering, winner) };
}

/** La chaîne des cumulables : la plus spécifique d'abord, puis l'id ; chacune sur le reste. */
function chainOf(
  applicable: readonly PriceRule[],
  context: PricingContext,
  entering: Exact,
  sealedOut: (rule: PriceRule) => boolean,
  rejected: RejectedRule[],
): Applied[] {
  const ordered = applicable
    .filter(isCumulative)
    .sort(
      (left, right) =>
        compareSpecificity(right, left, context.categoryPath) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
  const applied: Applied[] = [];
  let running = entering;
  for (const rule of ordered) {
    if (sealedOut(rule)) {
      rejected.push(rejectionOf(rule, "sealed"));
      continue;
    }
    running = applyRule(running, rule);
    applied.push({ rule, result: running });
  }
  return applied;
}

/** Une étape de trace par promotion appliquée ; les évincées vont sur la première. */
function outcome(
  running: Exact,
  applied: readonly Applied[],
  rejected: readonly RejectedRule[],
): PromotionStageOutcome {
  const superseded = rejected.filter((entry) => entry.cause === "superseded");
  const steps = applied.map(({ rule, result }, index): PriceStep => ({
    stage: rule.stage,
    ruleId: rule.id,
    label: rule.label,
    ...(rule.labels === undefined ? {} : { labels: rule.labels }),
    scope: rule.scope,
    // Arrondi pour l'AFFICHAGE seulement : la chaîne reste exacte.
    resultMillicents: roundToCents(result),
    supersedes:
      index === 0 ? superseded.map((entry) => ({ ruleId: entry.ruleId, label: entry.label })) : [],
  }));
  return { running, steps, rejected };
}
