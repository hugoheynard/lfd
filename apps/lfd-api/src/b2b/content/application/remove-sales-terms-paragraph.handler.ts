import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { RemoveSalesTermsParagraphCommand } from "./remove-sales-terms-paragraph.command.js";

/** Retire un article. Le document entier est réenregistré : il est UNE ligne. */
@CommandHandler(RemoveSalesTermsParagraphCommand)
export class RemoveSalesTermsParagraphHandler implements ICommandHandler<
  RemoveSalesTermsParagraphCommand,
  void
> {
  constructor(private readonly content: PlatformContentRepository) {}

  async execute(command: RemoveSalesTermsParagraphCommand): Promise<void> {
    const document = await this.content.loadSalesTerms();
    document.removeParagraph(command.paragraphId);
    await this.content.saveSalesTerms(document, command.staffUserId);
  }
}
