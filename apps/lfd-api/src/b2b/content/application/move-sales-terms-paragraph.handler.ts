import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { MoveSalesTermsParagraphCommand } from "./move-sales-terms-paragraph.command.js";

/**
 * Déplace un article.
 *
 * La borne haute du rang n'est pas dans le schéma du contrat et ne peut pas y
 * être : elle dépend du nombre d'articles, que seul l'agrégat connaît.
 */
@CommandHandler(MoveSalesTermsParagraphCommand)
export class MoveSalesTermsParagraphHandler implements ICommandHandler<
  MoveSalesTermsParagraphCommand,
  void
> {
  constructor(private readonly content: PlatformContentRepository) {}

  async execute(command: MoveSalesTermsParagraphCommand): Promise<void> {
    const document = await this.content.loadSalesTerms();
    document.moveParagraph(command.paragraphId, command.position);
    await this.content.saveSalesTerms(document, command.staffUserId);
  }
}
