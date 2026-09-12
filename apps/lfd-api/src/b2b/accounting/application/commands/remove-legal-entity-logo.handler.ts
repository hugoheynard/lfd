import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { loadOrFail } from "../legal-entity-support.js";
import { RemoveLegalEntityLogoCommand } from "./legal-entity-commands.js";

/**
 * Retire le logo de l'entité.
 *
 * **L'objet rangé n'est pas supprimé du stockage**, et c'est un choix : un
 * redépôt écrit à la même clé et l'écrase, tandis qu'une suppression qui
 * échouerait à mi-chemin laisserait la base dire « pas de logo » pendant que le
 * bucket en garde un. Deux vérités au lieu d'une, pour un octet qui ne fuit pas
 * — le bucket n'est pas public, et plus aucune clé en base n'y mène.
 *
 * Le mandat ressort ensuite avec sa cellule vide, ce qui est un document
 * parfaitement valide : c'est le formulaire de la norme, sans notre rond.
 */
@CommandHandler(RemoveLegalEntityLogoCommand)
export class RemoveLegalEntityLogoHandler implements ICommandHandler<
  RemoveLegalEntityLogoCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveLegalEntityLogoCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    entity.detachLogo();
    await this.uow.run(async () => {
      await this.entities.save(entity);
    });
  }
}
