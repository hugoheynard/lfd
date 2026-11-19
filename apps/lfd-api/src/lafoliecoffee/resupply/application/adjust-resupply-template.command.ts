import type { ResupplyTemplateContent } from "../domain/resupply-template.js";

/** Ajuster un modèle : le contenu entier, sous la version lue. Rend `{ id, version }`. */
export class AdjustResupplyTemplateCommand {
  constructor(
    readonly templateId: string,
    readonly content: ResupplyTemplateContent,
    readonly version: number,
    readonly staffUserId: string,
  ) {}
}
