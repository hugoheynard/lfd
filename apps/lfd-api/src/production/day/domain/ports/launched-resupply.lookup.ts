import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **« Ce réassort est-il lancé au plan de cette journée ? »** — une ligne de
 * `production_resupply`, pas la journée entière (audit du réassort,
 * 2026-11-02). L'appelant tient DÉJÀ le verrou de la journée : la réponse ne
 * vaut que sous lui.
 */
export abstract class LaunchedResupplyLookup {
  abstract isLaunched(day: ServiceDay, resupplyId: string): Promise<boolean>;
}
