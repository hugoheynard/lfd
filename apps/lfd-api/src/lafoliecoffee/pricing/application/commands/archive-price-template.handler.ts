import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PriceTemplateRepository } from "../../domain/ports/price-template.repository.js";
import { PriceTemplateNotFoundError } from "../../domain/pricing-errors.js";
import { ArchivePriceTemplateCommand } from "./archive-price-template.command.js";

/**
 * **Archiver un gabarit**, et non le supprimer.
 *
 * Un gabarit n'est qu'une source de copie : les mercuriales posées depuis lui
 * portent leurs propres lignes et ne bougent pas. L'archiver le retire des
 * listes de choix et le scelle.
 *
 * Archiver deux fois est **refusé (409)**, pas ignoré : c'est l'agrégat qui le
 * décide (`PriceTemplate.archive`), et un second clic veut dire que l'écran
 * montrait une liste périmée — le dire fait rafraîchir.
 *
 * @throws {PriceTemplateNotFoundError} aucun gabarit sous cet identifiant.
 * @throws {ArchivedPriceTemplateIsSealedError} il est déjà archivé.
 */
@CommandHandler(ArchivePriceTemplateCommand)
export class ArchivePriceTemplateHandler implements ICommandHandler<
  ArchivePriceTemplateCommand,
  void
> {
  constructor(
    private readonly templates: PriceTemplateRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchivePriceTemplateCommand): Promise<void> {
    const existing = await this.templates.load(command.id);
    if (existing === null) {
      throw new PriceTemplateNotFoundError(command.id);
    }
    await this.templates.save(existing.archive(this.clock.now()));
  }
}
