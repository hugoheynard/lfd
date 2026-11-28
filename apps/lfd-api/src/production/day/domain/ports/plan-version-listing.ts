import type { PlanVersionEntry } from "../services/plan-version-entries.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Ce que la journée sait répondre : la liste des versions de son plan**
 * (`documentation/fournil/plan-historique-des-tirages.md`, lot H4). Publiée
 * par le noyau, qui possède les versions, et lue par le plan, qui y ajoute
 * le papier rangé ou non (le stockage est à lui).
 */
export abstract class PlanVersionListing {
  /** De la première à la dernière ; vide pour une journée jamais versionnée. */
  abstract listOf(day: ServiceDay): Promise<readonly PlanVersionEntry[]>;
}
