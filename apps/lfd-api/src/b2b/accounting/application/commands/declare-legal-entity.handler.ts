import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntity } from "../../domain/entities/legal-entity.js";
import { LegalEntityDeclaredEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { LegalAddress } from "../../domain/value-objects/legal-address.js";
import { Siren } from "../../domain/value-objects/siren.js";
import { DeclareLegalEntityCommand } from "./legal-entity-commands.js";

/**
 * Déclare une entité émettrice — **sans ICS ni compte bancaire**.
 *
 * L'identifiant créancier est attribué par la Banque de France des semaines
 * après qu'on a saisi la raison sociale. Les exiger ensemble interdirait de
 * préparer le dossier pendant l'attente, c'est-à-dire pendant exactement la
 * période où l'on prépare un dossier. La complétude est donc une propriété
 * qu'on ACQUIERT (`canCollect`), pas une condition d'existence.
 *
 * L'identité est frappée ici, par le port `IdGenerator`, jamais par la base :
 * c'est ce qui permettra à la RUM d'un mandat d'en dériver avant la première
 * écriture.
 */
@CommandHandler(DeclareLegalEntityCommand)
export class DeclareLegalEntityHandler implements ICommandHandler<
  DeclareLegalEntityCommand,
  string
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeclareLegalEntityCommand): Promise<string> {
    const { payload } = command;
    const id = this.ids.next();
    const entity = LegalEntity.declare({
      id,
      name: payload.name,
      legalForm: payload.legalForm,
      // Les value objects valident : un SIREN à treize chiffres est refusé ici,
      // pas par une contrainte de base qui ne saurait pas dire pourquoi.
      siren: Siren.create(payload.siren),
      address: LegalAddress.create(payload.address),
      rcs: payload.rcs,
      shareCapitalCents: payload.shareCapitalCents,
      vatNumber: payload.vatNumber,
    });

    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new LegalEntityDeclaredEvent(id, at, payload.name, payload.siren),
      );
    });
    return id;
  }
}
