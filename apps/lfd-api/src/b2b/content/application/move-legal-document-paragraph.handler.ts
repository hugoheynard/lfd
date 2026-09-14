import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { MoveLegalDocumentParagraphCommand } from "./move-legal-document-paragraph.command.js";

/**
 * Déplace un article.
 *
 * La borne haute du rang n'est pas dans le schéma du contrat et ne peut pas y
 * être : elle dépend du nombre d'articles, que seul l'agrégat connaît.
 */
@CommandHandler(MoveLegalDocumentParagraphCommand)
export class MoveLegalDocumentParagraphHandler implements ICommandHandler<
  MoveLegalDocumentParagraphCommand,
  void
> {
  constructor(private readonly content: PlatformContentRepository) {}

  async execute(command: MoveLegalDocumentParagraphCommand): Promise<void> {
    const document = await this.content.loadLegalDocument(command.mention);
    document.moveParagraph(command.paragraphId, command.position);
    await this.content.saveLegalDocument(command.mention, document, command.staffUserId);
  }
}
