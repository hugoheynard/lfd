import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { PriceRuleNotFoundError } from "../../domain/pricing-errors.js";
import { describeRule, ruleCitations } from "../../domain/pricing-act.js";
import type { PricingRule } from "../../domain/entities/pricing-rule.js";
import type { PricingAct, PricingActKind, RuleNames } from "../../domain/pricing-act.js";
import type { PriceStage } from "../../domain/price-rule.js";
import { refuseLegacyPromotionEditor } from "../../../promotions/domain/promotions-source.js";

/**
 * **Les trois gestes qui arrêtent, reprennent et rangent une règle** — plus le
 * renommage — partagent ce qui suit : le chargement qui refuse l'absence, et
 * l'acte qui décrit la règle d'avant.
 *
 * Aucun ne décide d'un refus : les refus vivent dans l'agrégat, où le prochain
 * appelant — un import, un seed, le planificateur des paniers récurrents — les
 * trouvera aussi. Ici il n'y a que le cycle : charger, transitionner, rendre au
 * port avec l'acte.
 *
 * Les trois se ressemblent, et c'est voulu qu'ils restent **trois** : un
 * `ChangeRuleStateCommand` générique aurait été plus court et aurait perdu la
 * seule chose qui compte dans six mois — ce que l'utilisateur croyait faire.
 */

/**
 * Un **404** et non un silence : deux personnes peuvent avoir le même écran
 * ouvert, et celle qui arrive seconde mérite de savoir que son geste n'a rien
 * fait plutôt que de croire qu'il a marché.
 */
export async function mustLoad(rules: PricingRuleRepository, id: string): Promise<PricingRule> {
  const rule = await rules.load(id);
  if (rule === null) {
    throw new PriceRuleNotFoundError(id);
  }
  return rule;
}

/**
 * L'acte décrit la règle **telle qu'elle était avant** la transition.
 *
 * C'est ce qu'on cherche en relisant : « qu'est-ce qui a été suspendu », pas
 * « quel état a-t-elle pris ». L'état, le verbe le dit déjà.
 *
 * @param names les noms du moment de ce que la règle vise et de la société
 *   qu'elle vise (`ruleNamesOf`).
 * @param subjectLabel le nom de la règle au journal — son libellé, sauf quand
 *   le geste le change (`renamed` passe le nouveau).
 */
export function actOf(
  rule: PricingRule,
  kind: PricingActKind,
  actor: string,
  at: Date,
  reason: string | null,
  names: RuleNames,
  subjectLabel: string = rule.label,
): PricingAct {
  return {
    subjectType: "rule",
    subjectId: rule.id,
    kind,
    actor,
    at,
    reason,
    summary: describeRule(rule.asPriceRule, names),
    subjectLabel,
    ...ruleCitations(rule.asPriceRule, names),
  };
}

/**
 * **Une règle d'étage promotion ne s'écrit plus** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.10, L8 puis L12) : le calcul lit les promotions, et la règle
 * n'agirait sur aucun prix.
 *
 * @throws {LegacyPromotionEditorClosedError} étage promotion.
 */
export function assertRuleEditorOpen(stage: PriceStage): void {
  if (stage === "promotion") {
    refuseLegacyPromotionEditor("price_rule");
  }
}

/** {@link mustLoad}, puis {@link assertRuleEditorOpen} : les quatre gestes sur une règle. */
export async function mustLoadEditable(
  rules: PricingRuleRepository,
  id: string,
): Promise<PricingRule> {
  const rule = await mustLoad(rules, id);
  assertRuleEditorOpen(rule.asPriceRule.stage);
  return rule;
}
