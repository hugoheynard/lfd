import type { ResupplyTemplateContent } from "../domain/resupply-template.js";

/**
 * « Enregistrer comme modèle » pour un point. Rend `{ id, version }`.
 *
 * `key` est tirée par l'écran, une par geste : elle devient l'identifiant du
 * modèle, et un second envoi sous la même clé rend le modèle déjà écrit.
 */
export class CreateResupplyTemplateCommand {
  constructor(
    readonly siteId: string,
    readonly content: ResupplyTemplateContent,
    readonly staffUserId: string,
    readonly key: string,
  ) {}
}
