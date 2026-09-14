import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { UnmarkWorksheetLineCommand } from "./unmark-worksheet-line.command.js";

/**
 * **La coche s'enlève.**
 *
 * Même chemin que la coche, et les mêmes deux refus portés par `itemToMark` :
 * décocher une ligne d'une journée ouverte, ou un SKU qui n'est pas au compte du
 * jour, n'a pas plus de sens que de la cocher.
 *
 * Aucune horloge ici : on n'écrit pas d'instant, on en retire un. C'est la seule
 * commande du lot qui ne dépende pas du `Clock`.
 */
@CommandHandler(UnmarkWorksheetLineCommand)
export class UnmarkWorksheetLineHandler implements ICommandHandler<
  UnmarkWorksheetLineCommand,
  void
> {
  constructor(private readonly days: ProductionDayRepository) {}

  async execute(command: UnmarkWorksheetLineCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);
    current.itemToMark(command.sku);
    await this.days.markProduced(day, command.sku, null);
  }
}
