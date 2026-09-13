import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { EditSalesTermsParagraphCommand } from "./edit-sales-terms-paragraph.command.js";

/** Réécrit un article. Le refus « article inconnu » appartient à l'agrégat. */
@CommandHandler(EditSalesTermsParagraphCommand)
export class EditSalesTermsParagraphHandler implements ICommandHandler<
  EditSalesTermsParagraphCommand,
  void
> {
  constructor(private readonly content: PlatformContentRepository) {}

  async execute(command: EditSalesTermsParagraphCommand): Promise<void> {
    const document = await this.content.loadSalesTerms();
    document.editParagraph(command.paragraphId, command.prose);
    await this.content.saveSalesTerms(document, command.staffUserId);
  }
}
