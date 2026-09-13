import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { MarkWorksheetLineCommand } from "./mark-worksheet-line.command.js";

/**
 * **La ligne est faite.**
 *
 * Charger, demander à l'agrégat s'il laisse passer, écrire. Les deux refus — la
 * journée n'est pas arrêtée, ce SKU n'est pas au compte du jour — vivent dans
 * `itemToMark`, en un seul endroit : les recopier ici les rendrait invisibles au
 * prochain appelant.
 *
 * ⚠️ L'écriture est **ciblée** et non un `save` de l'agrégat, et c'est le cas
 * que le §3.1 autorise : six postes cochent six fiches en même temps, et un
 * `save` réécrit la journée entière. La justification complète est au-dessus de
 * `markProduced`, côté adaptateur.
 *
 * ⚠️ « Déjà cochée » n'est pas un refus, contrairement au colisage : le dernier
 * geste est le vrai, puisqu'une case se décoche et se recoche. Recocher réécrit
 * donc l'heure et les initiales, ce qui est exactement ce qu'on veut quand la
 * première coche était la mauvaise.
 *
 * Rend `void` : le client relit la fiche — §4.
 */
@CommandHandler(MarkWorksheetLineCommand)
export class MarkWorksheetLineHandler implements ICommandHandler<MarkWorksheetLineCommand, void> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: MarkWorksheetLineCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);
    current.itemToMark(command.sku);
    await this.days.markProduced(day, command.sku, {
      at: this.clock.now(),
      by: command.staffSubject,
      initials: command.initials,
    });
  }
}
