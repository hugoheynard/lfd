import type { PlanVersionDiffSummary } from "../services/plan-version-diff/plan-version-diff-summary.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Ce que la journée sait répondre : le résumé de ce qui a changé depuis
 * la version `n`** (`documentation/fournil/les-versions-du-plan.md`) — celui que porte l'e-mail « dossier mis à jour ». Calculé par le
 * même diff que l'écran, puis plafonné : l'écran et l'e-mail ne disent pas
 * deux choses différentes. Un port à part de la comparaison (ISP) : le
 * réenvoi ne lit que lui.
 */
export abstract class PlanVersionSummaries {
  /**
   * Un résumé par version de départ, de chacune jusqu'à `to` — une seule
   * lecture de la chaîne pour tous les destinataires d'un réenvoi.
   *
   * @throws {PlanVersionRangeInvertedError} une version de départ est après `to` (400).
   * @throws {PlanVersionNotFoundError} une version de la plage manque (404).
   */
  abstract since(
    day: ServiceDay,
    froms: readonly number[],
    to: number,
  ): Promise<ReadonlyMap<number, PlanVersionDiffSummary>>;
}
