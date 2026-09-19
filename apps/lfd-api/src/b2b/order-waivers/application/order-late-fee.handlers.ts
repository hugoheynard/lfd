import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { LateFeeSetting } from "../../orders/domain/ports/order-late-fee.reader.js";
import { OrderLateFeeClearedEvent, OrderLateFeeSetEvent } from "../domain/order-late-fee.events.js";
import { OrderLateFeeRepository } from "../domain/order-late-fee.repository.js";
import {
  ClearOrderLateFeeCommand,
  ReadOrderLateFeeQuery,
  SaveOrderLateFeeCommand,
} from "./order-late-fee.commands.js";

/**
 * **Pose** la surtaxe. L'auteur vient de la requête, jamais du corps : un
 * montant sans auteur ne se relit pas, et laisser l'appelant nommer quelqu'un
 * d'autre rendrait la trace inutile.
 *
 * Journalisé dans la transaction de l'écriture, avec le réglage d'avant (depuis
 * le 2026-09-19) : la ligne est réécrite en place, elle ne garde que le dernier.
 * Une réécriture à l'identique reste un fait — elle change l'auteur de la ligne.
 */
@CommandHandler(SaveOrderLateFeeCommand)
export class SaveOrderLateFeeHandler implements ICommandHandler<SaveOrderLateFeeCommand, void> {
  constructor(
    private readonly fees: OrderLateFeeRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SaveOrderLateFeeCommand): Promise<void> {
    await this.uow.run(async () => {
      const before = await this.fees.read();
      await this.fees.save(command.setting, command.updatedBy);
      await this.events.publishTraced(new OrderLateFeeSetEvent(before, command.setting));
    });
  }
}

/**
 * **Retire** la surtaxe. Retirer un réglage absent reste un succès sans trace :
 * rien n'a changé, et un fait qui dirait « retirée » sur une surtaxe qui
 * n'existait pas mentirait au lecteur.
 */
@CommandHandler(ClearOrderLateFeeCommand)
export class ClearOrderLateFeeHandler implements ICommandHandler<ClearOrderLateFeeCommand, void> {
  constructor(
    private readonly fees: OrderLateFeeRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(): Promise<void> {
    await this.uow.run(async () => {
      const before = await this.fees.read();
      if (before === null) {
        return;
      }
      await this.fees.clear();
      await this.events.publishTraced(new OrderLateFeeClearedEvent(before));
    });
  }
}

@QueryHandler(ReadOrderLateFeeQuery)
export class ReadOrderLateFeeHandler implements IQueryHandler<
  ReadOrderLateFeeQuery,
  LateFeeSetting | null
> {
  constructor(private readonly fees: OrderLateFeeRepository) {}

  async execute(): Promise<LateFeeSetting | null> {
    return this.fees.read();
  }
}
