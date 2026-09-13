import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { AddSalesTermsParagraphCommand } from "./add-sales-terms-paragraph.command.js";

/**
 * Ajoute un article et rend **son identifiant**.
 *
 * C'est la seule commande des CGV qui rende quelque chose, et le §4 l'autorise
 * explicitement : un identifiant n'est pas un modèle de lecture. L'écran en a
 * besoin pour sélectionner ce qu'il vient d'ajouter, et le déduire d'une
 * relecture supposerait qu'aucun autre rédacteur n'a écrit entre-temps.
 *
 * L'identifiant vient du port `IdGenerator` (ULID) et jamais du titre : un
 * article renommé garderait une clé qui ment, et deux homonymes se
 * marcheraient dessus.
 */
@CommandHandler(AddSalesTermsParagraphCommand)
export class AddSalesTermsParagraphHandler implements ICommandHandler<
  AddSalesTermsParagraphCommand,
  string
> {
  constructor(
    private readonly content: PlatformContentRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: AddSalesTermsParagraphCommand): Promise<string> {
    const document = await this.content.loadSalesTerms();
    const id = this.ids.next();
    document.addParagraph(id, command.prose);
    await this.content.saveSalesTerms(document, command.staffUserId);
    return id;
  }
}
