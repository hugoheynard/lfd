import { CarriedDecisionClosedError } from "../pricing-errors.js";
import { carriedScope, carriedWindow, type DecisionCarry } from "./decision-carry-over.js";
import type { PricingRuleDraft, PricingRuleState } from "./pricing-rule.js";

/** Le brouillon reporté, et la pause de l'ancienne (`null` = elle court). */
export interface CarriedRuleDraft {
  readonly draft: PricingRuleDraft;
  readonly pause: { readonly by: string | null } | null;
}

/**
 * **Ce qu'une règle reportée reprend de l'ancienne** — tout, sauf la portée
 * (la nouvelle référence) et la fenêtre (`max(maintenant, début)` → fin
 * réelle). Séparé de l'agrégat pour qu'il garde une seule raison de changer.
 *
 * Une règle `volume` d'avant le barème n'est plus saisissable : debout, elle
 * n'existe pas (elles sont toutes rangées) ; rencontrée, elle se dit close.
 *
 * @throws {DecisionNotOnReferenceError} la règle ne nomme pas l'ancienne référence.
 * @throws {CarriedDecisionClosedError} elle est archivée, terminée, ou d'étage `volume`.
 * @throws {RetroactiveCarryOverError} la fenêtre commencerait avant maintenant.
 */
export function carriedRuleDraft(
  source: PricingRuleState,
  carry: DecisionCarry,
  now: Date,
): CarriedRuleDraft {
  const scope = carriedScope(source.scope, source.id, carry);
  const window = carriedWindow(
    "price_rule",
    source.id,
    { ...source, archivedAt: source.lifecycle.archivedAt },
    now,
  );
  const { stage } = source;
  if (stage === "volume") {
    throw new CarriedDecisionClosedError("price_rule", source.id);
  }
  return {
    draft: {
      stage,
      scope,
      audience: source.audience,
      minQuantity: source.minQuantity,
      effect: source.effect,
      label: source.label,
      validFrom: window.validFrom,
      validTo: window.validTo,
      stacksOverMercuriale: source.stacksOverMercuriale,
    },
    pause: source.lifecycle.pausedAt === null ? null : { by: source.lifecycle.pausedBy },
  };
}
