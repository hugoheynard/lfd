import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { AddRequiredLegalSectionCommand } from "./add-required-legal-section.command.js";

/**
 * Crée une section requise et rend **son identifiant**, comme l'ajout d'un
 * article ordinaire — l'écran doit pouvoir désigner ce qu'il vient de poser.
 *
 * C'est le SEUL chemin qui pose une clé de section (§4.5, S2) : les charges
 * utiles d'ajout et d'édition ne la portent pas. Les refus — section non
 * exigée, déjà présente — appartiennent à l'agrégat.
 */
@CommandHandler(AddRequiredLegalSectionCommand)
export class AddRequiredLegalSectionHandler implements ICommandHandler<
  AddRequiredLegalSectionCommand,
  string
> {
  constructor(
    private readonly content: PlatformContentRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: AddRequiredLegalSectionCommand): Promise<string> {
    const document = await this.content.loadLegalDocument(
      command.mention,
      command.expectedRevision,
    );
    const id = this.ids.next();
    document.addRequiredSection(id, command.section, command.prose);
    await this.content.saveLegalDocument(command.mention, document, command.staffUserId);
    return id;
  }
}
