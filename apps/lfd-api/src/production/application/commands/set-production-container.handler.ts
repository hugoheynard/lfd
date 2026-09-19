import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import {
  ProductionContainerSetEvent,
  sameContainerRule,
} from "../../domain/events/production-container.events.js";
import { ProductionContainerReader } from "../../domain/ports/production-container.reader.js";
import { ProductionContainerRepository } from "../../domain/ports/production-container.repository.js";
import { SetProductionContainerCommand } from "./set-production-container.command.js";

/**
 * **Le réglage du four**, posé par le fournil.
 *
 * Aucun agrégat à charger, et aucune règle à demander : un contenant n'a ni état
 * ni transition — cf. l'en-tête du port. La forme (au moins une pièce, un mot
 * pour chaque nombre) est refusée à la frontière par `productionContainerSchema`,
 * et la base la porte aussi.
 *
 * Le SKU n'est **pas** vérifié contre le catalogue, et ce n'est pas un oubli :
 * la production ne lit pas le PIM et ne doit pas commencer. Un réglage posé sur
 * un SKU qui n'existe pas ne fait rien apparaître sur aucune fiche — il reste
 * une ligne morte dans une table de paramétrage.
 *
 * Journalisé dans la transaction de l'écriture, avec le réglage d'avant (depuis
 * le 2026-09-19) : la ligne est réécrite en place et ne garde que le dernier.
 * Un contenant reposé à l'identique est réécrit — son auteur change, comme
 * avant — mais n'écrit pas de fait : rien de ce que la fiche annonce n'a bougé.
 * L'avant se lit par le port de LECTURE, le seul qui sache lire le réglage.
 *
 * Rend `void` : le client relit la liste — §4.
 */
@CommandHandler(SetProductionContainerCommand)
export class SetProductionContainerHandler implements ICommandHandler<
  SetProductionContainerCommand,
  void
> {
  constructor(
    private readonly containers: ProductionContainerRepository,
    private readonly current: ProductionContainerReader,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetProductionContainerCommand): Promise<void> {
    await this.uow.run(async () => {
      const before = (await this.current.allBySku()).get(command.sku) ?? null;
      await this.containers.save(command.sku, command.rule, command.staffUserId);
      if (!sameContainerRule(before, command.rule)) {
        await this.events.publishTraced(
          new ProductionContainerSetEvent(command.sku, before, command.rule),
        );
      }
    });
  }
}
