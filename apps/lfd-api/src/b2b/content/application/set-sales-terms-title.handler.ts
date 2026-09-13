import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { SetSalesTermsTitleCommand } from "./set-sales-terms-title.command.js";

/** Renomme le document. `load → méthode métier → save`, sans exception. */
@CommandHandler(SetSalesTermsTitleCommand)
export class SetSalesTermsTitleHandler implements ICommandHandler<SetSalesTermsTitleCommand, void> {
  constructor(private readonly content: PlatformContentRepository) {}

  async execute(command: SetSalesTermsTitleCommand): Promise<void> {
    const document = await this.content.loadSalesTerms();
    document.retitle(command.heading);
    await this.content.saveSalesTerms(document, command.staffUserId);
  }
}
