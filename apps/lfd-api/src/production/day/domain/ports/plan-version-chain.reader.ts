import type { PlanVersion } from "../entities/plan-version.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Toutes les versions du plan d'une journée** — port de LECTURE, distinct
 * de celui de l'écrivain (ISP) : la liste et la comparaison lisent la chaîne
 * entière, l'écrivain ne lit que la dernière. Une journée a quelques
 * versions, pas des centaines : la chaîne se lit d'un bloc.
 */
export abstract class PlanVersionChainReader {
  /** Les versions de la journée, de la première à la dernière ; vide : jamais versionnée. */
  abstract allOf(day: ServiceDay): Promise<readonly PlanVersion[]>;
}
