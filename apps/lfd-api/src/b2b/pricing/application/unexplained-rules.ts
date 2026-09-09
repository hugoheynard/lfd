import type { PriceRuleView, UnexplainedRuleView } from "@lfd/contracts";

/**
 * **Les décisions en vigueur ce jour-là que la trace n'explique pas.**
 *
 * Pure, et c'est ce qui la rend éprouvable : elle ne lit ni base, ni horloge,
 * ni journal. La suspension d'un jour donné lui est **fournie**, parce que la
 * règle d'aujourd'hui ne sait plus la dire — `resume()` remet `pausedAt` à
 * `null`, donc une promotion suspendue puis reprise se relirait « en vigueur ».
 * Sur l'écran du litige, ce ne serait pas une réponse manquante mais une réponse
 * **fausse** ; l'intervalle vit au journal, qui est fait pour ça.
 *
 * L'ordre des causes n'est pas indifférent : la suspension est un **fait daté**,
 * l'audience une déduction. Une règle suspendue ce jour-là n'a pas besoin qu'on
 * cherche plus loin.
 */
export function unexplainedRules(
  inForce: readonly PriceRuleView[],
  explainedRuleIds: ReadonlySet<string>,
  companyId: string | null,
  suspendedThatDay: ReadonlySet<string>,
): readonly UnexplainedRuleView[] {
  return inForce
    .filter((rule) => !explainedRuleIds.has(rule.id))
    .map((rule) => ({
      ruleId: rule.id,
      label: rule.label,
      stage: rule.stage,
      scope: rule.scope,
      cause: causeOf(rule, companyId, suspendedThatDay),
    }));
}

/**
 * `null` = **on ne sait pas**, et il y a deux façons d'y arriver qu'il ne faut
 * pas confondre à la lecture :
 *
 * - une règle de **segment** : le segment du client n'est pas figé sur la
 *   commande, donc le juger avec celui d'aujourd'hui reconstruirait une
 *   appartenance qui a pu changer ;
 * - une règle qui visait **tout le monde** et n'a rien produit : là, il n'y a
 *   pas d'explication, et c'est le cas qui mérite qu'on ouvre le dossier.
 */
function causeOf(
  rule: PriceRuleView,
  companyId: string | null,
  suspendedThatDay: ReadonlySet<string>,
): UnexplainedRuleView["cause"] {
  if (suspendedThatDay.has(rule.id)) {
    return "suspended";
  }
  if (rule.audience.type === "company") {
    return rule.audience.id === companyId ? null : "out_of_audience";
  }
  return null;
}
