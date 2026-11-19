import type { SavedResupplyTemplateResponse } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyTemplateRepository } from "../domain/resupply-template.repository.js";
import { AdjustResupplyTemplateCommand } from "./adjust-resupply-template.command.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { loadResupplyTemplate, savedTemplate } from "./resupply-template-support.js";

/**
 * Ajuster un modèle — à l'écran des modèles, ou depuis le comptoir après
 * application : le contenu entier remplace le précédent, sous la version lue
 * (409 si un autre poste l'a écrit, ou s'il est archivé).
 *
 * @sans-journal comme les brouillons du fournil : l'auteur et l'instant du
 * dernier ajustement sont figés sur la ligne du modèle.
 */
@CommandHandler(AdjustResupplyTemplateCommand)
export class AdjustResupplyTemplateHandler implements ICommandHandler<
  AdjustResupplyTemplateCommand,
  SavedResupplyTemplateResponse
> {
  constructor(
    private readonly templates: ResupplyTemplateRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: AdjustResupplyTemplateCommand): Promise<SavedResupplyTemplateResponse> {
    const template = await loadResupplyTemplate(this.templates, command.templateId);
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    template.adjust(command.content, command.version, trace);
    return savedTemplate(this.templates, template);
  }
}
