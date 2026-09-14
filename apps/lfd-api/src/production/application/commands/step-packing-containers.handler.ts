import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ContainerStepConflictError } from "../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
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
 * Rend `void` : le client relit le poste — §4.
 */
@CommandHandler(StepPackingContainersCommand)
export class StepPackingContainersHandler implements ICommandHandler<
  StepPackingContainersCommand,
  void
> {
  constructor(private readonly days: ProductionDayRepository) {}

  async execute(command: StepPackingContainersCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    (await this.days.load(day)).containerStepOn(command.reference, command.step);
    const written = await this.days.stepContainerCount(day, command.reference, command.step);
    if (written || command.step === "remove") {
      return;
    }
    (await this.days.load(day)).containerStepOn(command.reference, command.step);
    throw new ContainerStepConflictError(command.reference);
  }
}
