import type { ResupplyTarget } from "../domain/site-resupply.js";

/**
 * Nomme la demande en cours d'une visée (lot R1g) ; `null` ou vide retire le
 * nom. Rend l'identifiant de la demande.
 */
export class NameSiteResupplyCommand {
  constructor(
    readonly siteId: string,
    readonly target: ResupplyTarget,
    readonly name: string | null,
  ) {}
}
