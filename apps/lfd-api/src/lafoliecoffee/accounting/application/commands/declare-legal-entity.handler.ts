import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntity } from "../../domain/entities/legal-entity.js";
import { LegalEntityDeclaredEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { LegalAddress } from "../../domain/value-objects/legal-address.js";
import { Siren } from "../../domain/value-objects/siren.js";
import { CREATED_ID_REPLAY } from "../created-id-replay.js";
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
 *
 * **Une fois par intention** : sujet, le SIREN déclaré. L'index unique du
 * SIREN refuse déjà une seconde entité, mais un double clic lisait ce refus
 * (409) après un succès ; la même clé rend la première, scellée avec elle.
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
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: DeclareLegalEntityCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: DECLARE_GESTURE,
        subject: intentSubject(command.payload.siren, command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) => this.declare(command, seal),
    );
  }

  private async declare(
    command: DeclareLegalEntityCommand,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
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
        new LegalEntityDeclaredEvent({ id, name: entity.name }, at, payload.name, payload.siren),
      );
      await seal(id);
    });
    return id;
  }
}

/** Le nom stable du geste, dans le registre des intentions. */
const DECLARE_GESTURE = "accounting.declare-legal-entity";
