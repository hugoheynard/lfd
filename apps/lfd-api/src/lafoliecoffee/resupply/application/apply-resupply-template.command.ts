import type { ResupplyTemplateApplyMode } from "@lfd/contracts";

import type { ResupplyTarget } from "../domain/site-resupply.js";

/**
 * Applique un modèle du point à la demande en cours d'une visée. Rend la
 * demande remplie et les lignes écartées.
 */
export class ApplyResupplyTemplateCommand {
  constructor(
    readonly siteId: string,
    readonly target: ResupplyTarget,
    readonly templateId: string,
    readonly mode: ResupplyTemplateApplyMode,
    /** Qui applique : la clé d'intention ne se partage pas entre deux personnes. */
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : la même
     * requête renvoyée n'applique pas deux fois — en `add`, elle doublerait
     * les quantités.
     */
    readonly intentKey: string,
  ) {}
}
