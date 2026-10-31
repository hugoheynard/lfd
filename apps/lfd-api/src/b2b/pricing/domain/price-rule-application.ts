import { addCents, compareExact, fromCents, scaleByBasisPoints, type Exact } from "@lfd/money";

import type { PriceRule, RejectedRule } from "./price-rule.js";
import { InvalidAlterationError } from "./pricing-errors.js";

/**
 * **Ce qu'une règle fait au prix qui entre** — partagé par la chaîne
 * (`resolvePrice`) et l'étage des promotions cumulables
 * (`cumulative-promotions.ts`, plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 16.1). Deux écritures de la même arithmétique finiraient par diverger
 * d'un arrondi : il n'y en a qu'une, en exact.
 *
 * `replace` pose un prix ; `alter` modifie celui qui entre.
 *
 * @throws {InvalidAlterationError} grandeur d'altération non strictement positive.
 */
export function applyRule(running: Exact, rule: PriceRule): Exact {
  if (rule.nature === "replace") {
    return fromCents(rule.amountMillicents);
  }

  const { alteration } = rule;
  const direction = alteration.direction === "increase" ? 1 : -1;
  const magnitude = alteration.mode === "percent" ? alteration.bp : alteration.millicents;
  if (!Number.isInteger(magnitude) || magnitude <= 0) {
    throw new InvalidAlterationError(magnitude);
  }

  return alteration.mode === "percent"
    ? scaleByBasisPoints(running, alteration.bp, direction)
    : addCents(running, alteration.millicents, direction);
}

/**
 * **De deux promotions strictement aussi spécifiques, la plus avantageuse
 * pour le client** (§ 13.2) : le prix sortant le plus bas, puis — à prix
 * égal — le plus petit identifiant, pour que la réponse ne dépende pas de
 * l'ordre de lecture.
 */
export function mostAdvantageous(left: PriceRule, right: PriceRule, entering: Exact): PriceRule {
  const delta = compareExact(applyRule(entering, left), applyRule(entering, right));
  if (delta !== 0) {
    return delta < 0 ? left : right;
  }
  return left.id <= right.id ? left : right;
}

/** Une règle écartée, avec ce que la trace garde d'elle. */
export function rejectionOf(rule: PriceRule, cause: RejectedRule["cause"]): RejectedRule {
  return {
    stage: rule.stage,
    ruleId: rule.id,
    label: rule.label,
    scope: rule.scope,
    cause,
  };
}
