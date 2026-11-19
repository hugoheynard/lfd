import type { SavedResupplyTemplateResponse } from "@lfd/contracts";

import type { ResupplyTemplate } from "../domain/resupply-template.js";
import { ResupplyTemplateNotFoundError } from "../domain/resupply-template-errors.js";
import type { ResupplyTemplateRepository } from "../domain/resupply-template.repository.js";

/** Gardes PARTAGÉES par les cas des modèles de réassort. */

/** Le modèle visé, ou 404. */
export async function loadResupplyTemplate(
  templates: ResupplyTemplateRepository,
  templateId: string,
): Promise<ResupplyTemplate> {
  const template = await templates.load(templateId);
  if (template === null) {
    throw new ResupplyTemplateNotFoundError(templateId);
  }
  return template;
}

/** Écrit le modèle et rend ce que l'écran relira. */
export async function savedTemplate(
  templates: ResupplyTemplateRepository,
  template: ResupplyTemplate,
): Promise<SavedResupplyTemplateResponse> {
  await templates.save(template);
  return { id: template.id, version: template.nextVersion };
}
