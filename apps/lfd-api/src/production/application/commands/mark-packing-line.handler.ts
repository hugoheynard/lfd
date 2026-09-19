import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { MarkPackingLineCommand } from "./mark-packing-line.command.js";

/**
 * **La ligne est dans le bac.**
 *
 * Charger, demander à l'agrégat s'il laisse passer, écrire. Les cinq refus —
 * journée non arrêtée, référence hors du plan, SKU hors du bon, **bac fermé**,
 * et **article pas encore sorti du four** — vivent dans `lineToFill`, en un
 * seul endroit : les recopier ici les rendrait invisibles au prochain appelant.
 *
 * ⚠️ `lineToFill` et non `lineToPack` : le dernier refus est ASYMÉTRIQUE. On ne
 * met pas au bac ce qui n'est pas fabriqué — la balance compterait comme
 * réparti ce qui n'existe pas — mais on peut toujours en ressortir une ligne
 * dont la coche d'atelier a été reprise. C'est la commande de décoche qui garde
 * `lineToPack`.
 *
 * ⚠️ L'écriture est **ciblée** et non un `save` de l'agrégat, et c'est le cas
 * que le §3.1 autorise : deux postes colisent deux bacs différents en même
 * temps, et un `save` réécrit la journée entière. La justification complète est
 * au-dessus de `markPackedLine`, côté adaptateur.
 *
 * ⚠️ « Déjà cochée » n'est pas un refus, contrairement à la FERMETURE du bac :
 * tant qu'il est ouvert, le dernier geste est le vrai. Recocher réécrit donc
 * l'heure et les initiales, ce qui est exactement ce qu'on veut quand la
 * première coche était la mauvaise.
 *
 * Rend `void` : le client relit le poste — §4.
 *
 * @sans-journal geste d'atelier, journalisation laissée au TODO par Hugo le
 * 2026-09-19 (une ligne par coche ou un fait par journée : à trancher —
 * `documentation/journalisation/todo-journal-activite.md`).
 */
@CommandHandler(MarkPackingLineCommand)
export class MarkPackingLineHandler implements ICommandHandler<MarkPackingLineCommand, void> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: MarkPackingLineCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);
    current.lineToFill(command.reference, command.sku);
    await this.days.markPackedLine(day, command.reference, command.sku, {
      at: this.clock.now(),
      by: command.staffUserId,
      initials: command.initials,
    });
  }
}
