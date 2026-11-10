import { VolumeLadderAggregate } from "../../domain/entities/volume-ladder.js";
import { VolumeLadderRepository } from "../../domain/ports/volume-ladder.repository.js";
import { describeLadder } from "../../domain/pricing-act.js";
import { VolumeLadderNotFoundError } from "../../domain/pricing-errors.js";
import type { PricingAct, PricingActKind } from "../../domain/pricing-act.js";

/**
 * **Les trois gestes qui arrêtent, reprennent et rangent un barème** partagent
 * ce qui suit : le chargement qui refuse l'absence, et l'acte qui décrit le
 * barème d'avant.
 *
 * Le port les déclarait (`update`) depuis la persistance des barèmes, et
 * l'agrégat ne savait rien en faire : ni méthode, ni route, ni bouton. Un
 * barème ne pouvait donc que naître — et rester. La seule façon d'en corriger un
 * était d'en poser un autre, que la contrainte d'exclusion refusait.
 *
 * Aucun refus ici : ils vivent dans l'agrégat, comme pour les règles.
 */

/** @throws {VolumeLadderNotFoundError} aucun barème sous cet identifiant. */
export async function mustLoadLadder(
  ladders: VolumeLadderRepository,
  id: string,
): Promise<VolumeLadderAggregate> {
  const ladder = await ladders.load(id);
  if (ladder === null) {
    throw new VolumeLadderNotFoundError(id);
  }
  return ladder;
}

/**
 * L'acte décrit le barème **tel qu'il était AVANT** le geste.
 *
 * C'est ce qui rend le journal lisible six mois plus tard : « suspendu — barème
 * de volume, 3 paliers » dit ce qu'on a arrêté. Décrire l'état d'après aurait
 * raconté le résultat, pas la décision.
 */
export function ladderAct(
  ladder: VolumeLadderAggregate,
  kind: PricingActKind,
  actor: string,
  at: Date,
  reason: string | null,
): PricingAct {
  return {
    subjectType: "ladder",
    subjectId: ladder.id,
    kind,
    actor,
    at,
    reason,
    summary: describeLadder(ladder.asLadder),
    subjectLabel: ladder.asLadder.label,
  };
}
