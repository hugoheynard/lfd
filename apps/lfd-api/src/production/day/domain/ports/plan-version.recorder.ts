import type { PlanVersionAuthor, PlanVersionCause } from "../entities/plan-version.js";
import type { ProductionDay } from "../entities/production-day.js";

/**
 * **Sauver une journée en gardant la version de son plan**
 * (`documentation/fournil/plan-historique-des-tirages.md`, § 1.1 à 1.6) —
 * ce qu'un geste qui change le plan figé appelle à la place de
 * `ProductionDayRepository.save` : arrêt, retirage, réassort lancé,
 * révision et retrait après l'arrêt. La réouverture et la ré-annonce ne
 * l'appellent pas.
 *
 * Sous le verrou de la journée, dans la transaction du geste. Un échec fait
 * échouer le geste : la trace ne peut pas manquer (§ 2 bis).
 */
export abstract class PlanVersionRecorder {
  /**
   * Sauve la journée ; si son plan a changé depuis la version précédente,
   * la journée prend le numéro suivant (écrit par le même `save`) et la
   * version est ajoutée.
   *
   * @param withdrawnOrderId la commande que CE geste retire : son retrait
   *   porte `by` dans la version ; les autres gardent l'auteur que la version
   *   précédente leur connaissait.
   */
  abstract save(
    day: ProductionDay,
    cause: PlanVersionCause,
    by: PlanVersionAuthor,
    withdrawnOrderId?: string | null,
  ): Promise<void>;
}
