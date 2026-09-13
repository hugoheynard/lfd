import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { AddLegalDocumentParagraphCommand } from "./add-legal-document-paragraph.command.js";

/**
 * Ajoute un article et rend **son identifiant**.
 *
 * C'est la seule commande des documents légaux qui rende quelque chose, et le
 * §4 l'autorise explicitement : un identifiant n'est pas un modèle de lecture.
 * L'écran en a besoin pour sélectionner ce qu'il vient d'ajouter, et le déduire
 * d'une relecture supposerait qu'aucun autre rédacteur n'a écrit entre-temps.
 *
 * L'identifiant vient du port `IdGenerator` (ULID) et jamais du titre : un
 * article renommé garderait une clé qui ment, et deux homonymes se
 * marcheraient dessus.
 */
@CommandHandler(AddLegalDocumentParagraphCommand)
export class AddLegalDocumentParagraphHandler implements ICommandHandler<
  AddLegalDocumentParagraphCommand,
  string
> {
  constructor(
    private readonly content: PlatformContentRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: AddLegalDocumentParagraphCommand): Promise<string> {
    const document = await this.content.loadLegalDocument(command.mention);
    const id = this.ids.next();
    document.addParagraph(id, command.prose);
    await this.content.saveLegalDocument(command.mention, document, command.staffUserId);
    return id;
  }
}
