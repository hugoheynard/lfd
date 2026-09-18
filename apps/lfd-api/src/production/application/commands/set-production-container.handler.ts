import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

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
 * Rend `void` : le client relit la liste — §4.
 */
@CommandHandler(SetProductionContainerCommand)
export class SetProductionContainerHandler implements ICommandHandler<
  SetProductionContainerCommand,
  void
> {
  constructor(private readonly containers: ProductionContainerRepository) {}

  async execute(command: SetProductionContainerCommand): Promise<void> {
    await this.containers.save(command.sku, command.rule, command.staffUserId);
  }
}
