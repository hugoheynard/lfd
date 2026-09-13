import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { SetLegalDocumentTitleCommand } from "./set-legal-document-title.command.js";

/** Renomme le document. `load → méthode métier → save`, sans exception. */
@CommandHandler(SetLegalDocumentTitleCommand)
export class SetLegalDocumentTitleHandler implements ICommandHandler<
  SetLegalDocumentTitleCommand,
  void
> {
  constructor(private readonly content: PlatformContentRepository) {}

  async execute(command: SetLegalDocumentTitleCommand): Promise<void> {
    const document = await this.content.loadLegalDocument(command.mention);
    document.retitle(command.heading);
    await this.content.saveLegalDocument(command.mention, document, command.staffUserId);
  }
}
