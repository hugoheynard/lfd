import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { PriceRuleNotFoundError } from "../../domain/pricing-errors.js";
import { describeRule } from "../../domain/pricing-act.js";
import type { PricingRule } from "../../domain/entities/pricing-rule.js";
import type { PricingAct, PricingActKind } from "../../domain/pricing-act.js";

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
 */
export function actOf(
  rule: PricingRule,
  kind: PricingActKind,
  actor: string,
  at: Date,
  reason: string | null,
): PricingAct {
  return {
    subjectType: "rule",
    subjectId: rule.id,
    kind,
    actor,
    at,
    reason,
    summary: describeRule(rule.asPriceRule),
  };
}
