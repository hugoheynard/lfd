import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ContainerStepConflictError } from "../../domain/errors/production-errors.js";
import { PackingStation } from "../../channels/packing/packing-station.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { stationOrderOf } from "../services/packing-station-ref.js";
import { StepPackingContainersCommand } from "./step-packing-containers.command.js";

/**
 * **Le « + » et le « − » du poste de colisage.**
 *
 * Charger, demander à l'agrégat si le pas a un sens (`containerStepOn`), puis
 * laisser la BASE compter. Le handler ne calcule aucun compte, et c'est tout le
 * sujet : un calcul ici suivi d'une écriture perdrait un container quand deux
 * postes appuient ensemble.
 *
 * ## Quand la base n'écrit rien
 *
 * - **retrait** : sans effet, et sans erreur. C'est un retrait à zéro, ou un bac
 *   fermé entre la lecture et l'écriture — dans les deux cas rien n'a bougé, et
 *   l'écran relit ce qui est vrai. Il n'a pas à comparer le compte à zéro pour
 *   savoir s'il peut appuyer ;
 * - **ajout** : on RELIT, et l'agrégat dit pourquoi — plafond atteint, bac fermé
 *   entre-temps. S'il ne trouve rien à refuser, un autre poste a changé la
 *   commande entre les deux instants, et on le dit plutôt que de réessayer en
 *   silence : un « + » qui s'applique deux fois se voit moins qu'un refus.
 *
 * Aucune identité staff : un compte n'est pas un fait daté, et aucune colonne ne
 * garderait son auteur. Qui a appuyé se lirait dans le journal.
 *
 * Sur une journée `packing` (K2), le geste est remis au poste du colisage
 * après les refus structurels : le bac y est verrouillé, et le compte s'écrit
 * sans course possible — cf. `PackingStationService`.
 *
 * Rend `void` : le client relit le poste — §4.
 *
 * @sans-journal geste d'atelier, journalisation laissée au TODO par Hugo le
 * 2026-09-19 (une ligne par coche ou un fait par journée : à trancher —
 * `documentation/journalisation/todo-journal-activite.md`).
 */
@CommandHandler(StepPackingContainersCommand)
export class StepPackingContainersHandler implements ICommandHandler<
  StepPackingContainersCommand,
  void
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly station: PackingStation,
  ) {}

  async execute(command: StepPackingContainersCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);
    const order = stationOrderOf(current, command.reference);
    if (order !== null) {
      await this.station.stepContainers(order, command.step);
      return;
    }
    current.containerStepOn(command.reference, command.step);
    const written = await this.days.stepContainerCount(day, command.reference, command.step);
    if (written || command.step === "remove") {
      return;
    }
    (await this.days.load(day)).containerStepOn(command.reference, command.step);
    throw new ContainerStepConflictError(command.reference);
  }
}
