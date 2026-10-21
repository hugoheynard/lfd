import type { ResupplyTarget } from "../domain/site-resupply.js";

/** Ajoute un article à la demande en cours d'une visée. Rend l'identifiant de la demande. */
export class AddSiteResupplyLineCommand {
  constructor(
    readonly siteId: string,
    readonly target: ResupplyTarget,
    readonly sku: string,
    readonly quantity: number,
  ) {}
}
