import type { SavedResupplyTemplateResponse } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { ResupplyTemplate } from "../domain/resupply-template.js";
import { ResupplyTemplateAlreadyWrittenError } from "../domain/resupply-template-errors.js";
import { ResupplyTemplateRepository } from "../domain/resupply-template.repository.js";
import { ensureSiteExists } from "./bakehouse-resupply-draft-support.js";
import { CreateResupplyTemplateCommand } from "./create-resupply-template.command.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { savedTemplate } from "./resupply-template-support.js";

/**
 * « Enregistrer comme modèle » : un modèle neuf dans la bibliothèque du
 * point. Le point doit exister ; les SKU ne sont pas lus au catalogue — la
 * lecture marque une ligne qui ne s'appliquerait plus.
 *
 * Une création, une fois : la clé de l'écran est l'identifiant du modèle.
 * Déjà écrite pour ce point, le modèle écrit est rendu tel qu'il est, y
 * compris quand deux envois se croisent (le second bute sur la clé primaire,
 * puis relit). Prise par le modèle d'un autre point, elle est refusée.
 *
 * @sans-journal comme les brouillons du fournil : l'auteur et l'instant sont
 * figés sur la ligne du modèle, et le modèle est jetable (M8).
 */
@CommandHandler(CreateResupplyTemplateCommand)
export class CreateResupplyTemplateHandler implements ICommandHandler<
  CreateResupplyTemplateCommand,
  SavedResupplyTemplateResponse
> {
  constructor(
    private readonly templates: ResupplyTemplateRepository,
    private readonly sites: ResupplySites,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateResupplyTemplateCommand): Promise<SavedResupplyTemplateResponse> {
    const replayed = await this.alreadyWritten(command);
    if (replayed !== null) {
      return replayed;
    }
    await ensureSiteExists(this.sites, command.siteId);
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    const template = ResupplyTemplate.create({
      id: command.key,
      siteId: command.siteId,
      content: command.content,
      trace,
    });
    try {
      return await savedTemplate(this.templates, template);
    } catch (error) {
      if (!(error instanceof ResupplyTemplateAlreadyWrittenError)) {
        throw error;
      }
      const raced = await this.alreadyWritten(command);
      if (raced === null) {
        throw error;
      }
      return raced;
    }
  }

  /** Le modèle déjà écrit sous cette clé, pour ce point ; une clé d'un autre point est refusée. */
  private async alreadyWritten(
    command: CreateResupplyTemplateCommand,
  ): Promise<SavedResupplyTemplateResponse | null> {
    const existing = await this.templates.load(command.key);
    if (existing === null) {
      return null;
    }
    existing.assertReplayableFor(command.siteId);
    return { id: existing.id, version: existing.version };
  }
}
