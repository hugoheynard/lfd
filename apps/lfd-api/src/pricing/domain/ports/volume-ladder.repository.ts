import type { VolumeLadderAggregate } from "../entities/volume-ladder.js";
import type { PricingAct } from "../pricing-act.js";

/**
 * Port d'**écriture** des barèmes de volume.
 *
 * `pose` prend un **agrégat**, jamais des primitives : c'est ce qui garantit que
 * tout ce qui entre en base est passé par ses refus — un barème qui régresse,
 * deux paliers à la même quantité, une échelle vide.
 *
 * Et il prend son **acte**, comme les règles et les limites : un port qui
 * accepterait une mutation sans sa trace laisserait un appelant en écrire une
 * sans journal. L'adaptateur écrit les deux dans la même transaction.
 */
export abstract class VolumeLadderRepository {
  /**
   * @throws {OverlappingVolumeLadderError} un barème couvre déjà cette cible sur
   *   tout ou partie de la fenêtre. C'est la contrainte d'exclusion qui parle.
   */
  abstract pose(ladder: VolumeLadderAggregate, act: PricingAct): Promise<void>;

  /** L'agrégat, pour lui appliquer une transition. `null` s'il n'existe pas. */
  abstract load(id: string): Promise<VolumeLadderAggregate | null>;

  /** Enregistre une transition — suspendre, reprendre, archiver. */
  abstract update(ladder: VolumeLadderAggregate, act: PricingAct): Promise<void>;
}
