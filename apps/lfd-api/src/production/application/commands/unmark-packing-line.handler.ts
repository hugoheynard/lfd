import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { UnmarkPackingLineCommand } from "./unmark-packing-line.command.js";

/**
 * **La ligne ressort du bac.**
 *
 * Même chemin que la coche, et les mêmes quatre refus portés par `lineToPack` —
 * dont le bac fermé : décocher après la fermeture ferait mentir ce que le
 * commerce a déjà annoncé au client.
 *
 * ⚠️ Le cinquième refus de la coche — « pas encore sorti du four » — ne
 * s'applique PAS ici, et c'est délibéré : si un fournil reprend sa coche
 * d'atelier, la ligne déjà mise au bac doit pouvoir en ressortir. Refuser les
 * deux sens enfermerait l'exploitant avec un bac qu'il ne peut ni compléter ni
 * corriger. D'où `lineToPack` et non `lineToFill`.
 *
 * Aucune horloge ici : on n'écrit pas d'instant, on en retire un. C'est la seule
 * commande du poste qui ne dépende pas du `Clock`.
 */
@CommandHandler(UnmarkPackingLineCommand)
export class UnmarkPackingLineHandler implements ICommandHandler<UnmarkPackingLineCommand, void> {
  constructor(private readonly days: ProductionDayRepository) {}

  async execute(command: UnmarkPackingLineCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);
    current.lineToPack(command.reference, command.sku);
    await this.days.markPackedLine(day, command.reference, command.sku, null);
  }
}
