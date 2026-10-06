import type { AttemptTrace } from "../services/auto-close-round.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Ce que le tour de l'arrêt automatique lit chez le fournil** (plan
 * `plan-arret-du-plan.md`, §3, B2, lot A2) — un port à part des dépôts (ISP) :
 * le tour ne charge aucun agrégat, il pose deux questions fermées.
 */
export abstract class AutoCloseRoundReader {
  /** Le plan de cette journée est-il arrêté ? Une journée jamais écrite ne l'est pas. */
  abstract isPlanClosed(day: ServiceDay): Promise<boolean>;

  /**
   * La tentative automatique tracée pour cette journée, ou `null`. Son issue
   * et son heure de prise : une `pending` trop vieille est morte (Q8).
   */
  abstract attemptOf(day: ServiceDay): Promise<AttemptTrace | null>;
}
