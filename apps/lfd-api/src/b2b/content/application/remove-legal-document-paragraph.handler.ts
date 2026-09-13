import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { RemoveLegalDocumentParagraphCommand } from "./remove-legal-document-paragraph.command.js";

/** Retire un article. Le document entier est réenregistré : il est UNE ligne. */
@CommandHandler(RemoveLegalDocumentParagraphCommand)
export class RemoveLegalDocumentParagraphHandler implements ICommandHandler<
  RemoveLegalDocumentParagraphCommand,
  void
> {
  constructor(private readonly content: PlatformContentRepository) {}

  async execute(command: RemoveLegalDocumentParagraphCommand): Promise<void> {
    const document = await this.content.loadLegalDocument(command.mention);
    document.removeParagraph(command.paragraphId);
    await this.content.saveLegalDocument(command.mention, document, command.staffUserId);
  }
}
