import { overlapSegments, type OverlapSegment } from "./rule-overlaps.js";
import { ladderAtTier, type VolumeLadder } from "./volume-ladder.js";
import type { PriceRule } from "./price-rule.js";

/**
 * **La frise d'une lignée, barèmes compris.**
 *
 * Le barème a quitté `price_rules` pour sa propre table, et la frise ne le voyait
 * plus. Elle disait donc moins que la vérité — ce qui est pire qu'en dire peu :
 * une frise sans barème se lit « rien d'autre ne joue », alors que « −20 % sur le
 * catalogue **et** −10 % dès 50 » est le cumul le plus banal du modèle.
 *
 * Le raccordement ne touche ni la résolution ni l'arbitrage : une échelle se
 * présente sous la forme de la règle d'étage volume qu'elle est à un palier
 * donné, et le reste du module continue de ne connaître que des `PriceRule`.
 *
 * **Un barème n'a pas un cumul, il en a autant que de paliers.** Composer avec
 * un seul chiffre obligerait à choisir un palier, donc à afficher un pourcentage
 * faux pour toutes les autres quantités. La frise calcule donc les **deux
 * bouts** — l'échelle à son premier palier, l'échelle à son dernier — et l'écran
 * annonce une fourchette quand ils diffèrent.
 */
export function lineageSegments(
  rules: readonly PriceRule[],
  ladders: readonly VolumeLadder[],
): OverlapSegment[] {
  const ends = ladders.filter((ladder) => ladder.suspendedFrom === null).flatMap(endsOf);
  if (ends.length === 0) {
    return overlapSegments(rules);
  }

  const atEntry = overlapSegments([...rules, ...ends.map((pair) => pair.entry)]);
  const atTop = overlapSegments([...rules, ...ends.map((pair) => pair.top)]);

  return atEntry.map((segment) => ({
    ...segment,
    composedTopBp: matching(atTop, segment)?.composedBp ?? segment.composedBp,
  }));
}

/**
 * Les **deux bouts** d'une échelle — son premier palier, son dernier.
 *
 * Les paliers sont triés croissants (l'agrégat le garantit), donc le premier est
 * le seuil le plus bas et le dernier la remise la plus forte. Une échelle sans
 * palier ne rend aucun bout plutôt qu'un bout inventé : elle n'existe pas dans
 * le modèle, et un `[]` la fait simplement disparaître de la frise.
 */
function endsOf(ladder: VolumeLadder): { entry: PriceRule; top: PriceRule }[] {
  const entry = ladder.tiers[0];
  const top = ladder.tiers[ladder.tiers.length - 1];
  if (entry === undefined || top === undefined) {
    return [];
  }
  return [{ entry: ladderAtTier(ladder, entry), top: ladderAtTier(ladder, top) }];
}

/**
 * La même tranche dans l'autre découpage.
 *
 * Appariée par ses **bornes** et non par son rang : les deux découpages portent
 * les mêmes fenêtres, donc les mêmes tranches — mais s'appuyer sur l'ordre ferait
 * dépendre un pourcentage affiché d'une hypothèse invisible.
 */
function matching(
  segments: readonly OverlapSegment[],
  target: OverlapSegment,
): OverlapSegment | undefined {
  return segments.find(
    (segment) =>
      segment.from.getTime() === target.from.getTime() &&
      (segment.to?.getTime() ?? null) === (target.to?.getTime() ?? null),
  );
}
