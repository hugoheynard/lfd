import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LastActiveLegalEntityError } from "../../domain/errors/accounting-errors.js";
import { LegalEntityArchivalChangedEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetLegalEntityArchivedCommand } from "./legal-entity-commands.js";

/**
 * Archive une entité, ou la remet en service.
 *
 * **Jamais de suppression physique.** Une entité citée par un mandat signé ou
 * par une facture émise ne s'efface pas : le document garde son identifiant, et
 * un `DELETE` transformerait une référence en trou. Archiver dit « elle n'émet
 * plus » sans rien retirer à ce qu'elle a émis.
 *
 * Un seul handler pour les deux sens : ce sont les deux positions d'une même
 * bascule, et deux handlers jumeaux auraient divergé au premier ajout de règle.
 *
 * ## 🔴 La règle de l'ensemble, et pourquoi elle est ICI
 *
 * On n'archive pas la **dernière entité en service**. Cette règle porte sur
 * l'ENSEMBLE, pas sur l'instance : `archive()` ne peut pas la tenir, parce
 * qu'un agrégat ne voit pas ses frères. La poser dans l'agrégat aurait demandé
 * de lui injecter un dépôt — ce qui en ferait autre chose qu'un agrégat.
 *
 * ⚠️ Elle est donc **un cran plus bas** dans la hiérarchie des garde-fous que
 * les invariants de l'entité : refusée par le handler, pas par l'agrégat ni par
 * la base. Deux archivages simultanés des deux dernières entités pourraient
 * théoriquement passer tous les deux — « au moins une ligne non archivée » ne
 * s'exprime ni en contrainte ni en index partiel, il faudrait un déclencheur.
 * La fenêtre est de quelques millisecondes sur un écran que deux personnes
 * n'ouvrent pas ensemble, et le tableau de bord dit le lendemain qu'aucun
 * prélèvement n'est possible. Le prix d'un déclencheur Postgres — un mécanisme
 * que ce dépôt n'emploie nulle part — serait plus élevé que ce risque.
 *
 * La remise en service, elle, ne franchit aucune règle : elle ne peut
 * qu'augmenter le nombre d'entités disponibles.
 */
@CommandHandler(SetLegalEntityArchivedCommand)
export class SetLegalEntityArchivedHandler implements ICommandHandler<
  SetLegalEntityArchivedCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetLegalEntityArchivedCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const at = this.clock.now();
    if (command.archived) {
      if (!(await this.entities.hasAnotherActive(command.legalEntityId))) {
        throw new LastActiveLegalEntityError(command.legalEntityId);
      }
      entity.archive(at);
    } else {
      entity.restore();
    }

    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new LegalEntityArchivalChangedEvent(command.legalEntityId, at, command.archived),
      );
    });
  }
}
