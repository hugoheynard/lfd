import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PackingStation } from "../../channels/packing/packing-station.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { stationOrderOf } from "../services/packing-station-ref.js";
import { DeclarePackingContainersCommand } from "./declare-packing-containers.command.js";

/**
 * **Les bacs de la commande sont comptés.**
 *
 * Charger, demander à l'agrégat s'il laisse passer, écrire. Les quatre refus —
 * journée non arrêtée, référence hors du plan, **bac fermé**, nombre qui n'en
 * est pas un — vivent dans `declareContainers` : les recopier ici les rendrait
 * invisibles au prochain appelant.
 *
 * ⚠️ L'écriture est **ciblée** et non un `save` de l'agrégat, pour la raison
 * écrite au-dessus de `recordContainerCount` côté adaptateur : deux postes
 * tiennent deux bons au même moment, et `save` réécrit la journée entière.
 *
 * 🔴 **Aucune identité staff ici, et la commande n'en prend pas.** Un compte de
 * bacs n'est pas un fait attesté comme une coche ou une fermeture : c'est un
 * état courant, qui se corrige tant que la commande est ouverte, et qu'un
 * auteur daté ne prouverait pas — le geste suivant l'écraserait.
 *
 * La commande a d'abord porté un `staffSubject` que personne ne lisait. C'est
 * exactement ce dont le dépôt se méfie : un champ qu'une règle reçoit sans
 * jamais l'ouvrir laisse croire qu'il pèse, et le prochain lecteur cherche la
 * colonne qui n'existe pas. Le jour où l'on voudra savoir qui a compté, on
 * ajoutera `container_count_by` — et c'est cette colonne qui ramènera le
 * paramètre, pas l'inverse (retiré le 2026-09-13).
 *
 * Sur une journée `packing` (K2), le geste est remis au poste du colisage
 * après les refus structurels — cf. `MarkPackingLineHandler`.
 *
 * Rend `void` : le client relit le poste — §4.
 *
 * @sans-journal geste d'atelier, journalisation laissée au TODO par Hugo le
 * 2026-09-19 (une ligne par coche ou un fait par journée : à trancher —
 * `documentation/journalisation/todo-journal-activite.md`).
 */
@CommandHandler(DeclarePackingContainersCommand)
export class DeclarePackingContainersHandler implements ICommandHandler<
  DeclarePackingContainersCommand,
  void
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly station: PackingStation,
  ) {}

  async execute(command: DeclarePackingContainersCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);
    const order = stationOrderOf(current, command.reference);
    if (order !== null) {
      await this.station.declareContainers(order, command.containers);
      return;
    }
    current.declareContainers(command.reference, command.containers);
    await this.days.recordContainerCount(day, command.reference, command.containers);
  }
}
