import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyTemplateRepository } from "../domain/resupply-template.repository.js";
import { ArchiveResupplyTemplateCommand } from "./archive-resupply-template.command.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { loadResupplyTemplate } from "./resupply-template-support.js";

/**
 * Archiver un modèle : un statut, jamais une suppression (M7). Son nom
 * redevient libre parmi les modèles actifs du point.
 *
 * @sans-journal comme les brouillons du fournil : qui l'a archivé et quand
 * sont figés sur la ligne du modèle (`archived_*`).
 */
@CommandHandler(ArchiveResupplyTemplateCommand)
export class ArchiveResupplyTemplateHandler implements ICommandHandler<
  ArchiveResupplyTemplateCommand,
  void
> {
  constructor(
    private readonly templates: ResupplyTemplateRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchiveResupplyTemplateCommand): Promise<void> {
    const template = await loadResupplyTemplate(this.templates, command.templateId);
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    template.archive(trace);
    await this.templates.save(template);
  }
}
