import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { EditLegalDocumentParagraphCommand } from "./edit-legal-document-paragraph.command.js";

/** Réécrit un article. Le refus « article inconnu » appartient à l'agrégat. */
@CommandHandler(EditLegalDocumentParagraphCommand)
export class EditLegalDocumentParagraphHandler implements ICommandHandler<
  EditLegalDocumentParagraphCommand,
  void
> {
  constructor(private readonly content: PlatformContentRepository) {}

  async execute(command: EditLegalDocumentParagraphCommand): Promise<void> {
    const document = await this.content.loadLegalDocument(command.mention);
    document.editParagraph(command.paragraphId, command.prose);
    await this.content.saveLegalDocument(command.mention, document, command.staffUserId);
  }
}
