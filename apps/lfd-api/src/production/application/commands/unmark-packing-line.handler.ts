import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PackingStation } from "../../channels/packing/packing-station.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { stationOrderOf } from "../services/packing-station-ref.js";
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
 * Sous le verrou de la journée (D4 des fournées), comme la mise au bac : un
 * `save` concurrent (retirage) réécrit le colisage depuis SON instantané, et
 * c'est le verrou qui ordonne les deux.
 *
 * Sur une journée `packing` (K2), le geste est remis au poste du colisage
 * après les refus structurels — cf. `MarkPackingLineHandler`.
 *
 * Aucune horloge ici : on n'écrit pas d'instant, on en retire un. C'est la seule
 * commande du poste qui ne dépende pas du `Clock`.
 *
 * @sans-journal geste d'atelier, journalisation laissée au TODO par Hugo le
 * 2026-09-19 (une ligne par coche ou un fait par journée : à trancher —
 * `documentation/journalisation/todo-journal-activite.md`).
 */
@CommandHandler(UnmarkPackingLineCommand)
export class UnmarkPackingLineHandler implements ICommandHandler<UnmarkPackingLineCommand, void> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly lock: ProductionDayLock,
    private readonly uow: UnitOfWork,
    private readonly station: PackingStation,
  ) {}

  async execute(command: UnmarkPackingLineCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    await this.uow.run(async () => {
      await this.lock.lock(day);
      const current = await this.days.load(day);
      const order = stationOrderOf(current, command.reference);
      if (order !== null) {
        await this.station.unmarkLine(order, command.sku);
        return;
      }
      current.lineToPack(command.reference, command.sku);
      await this.days.markPackedLine(day, command.reference, command.sku, null);
    });
  }
}
