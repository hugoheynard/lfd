import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { GeneralOrderCutoffRule } from "../domain/general-order-cutoff.js";
import { GeneralOrderCutoffRepository } from "../domain/general-order-cutoff.repository.js";
import { OrderCutoffCreatedEvent, OrderCutoffUpdatedEvent } from "../domain/order-cutoff.events.js";
import { DefineGeneralOrderCutoffCommand } from "./define-general-order-cutoff.command.js";

/**
 * **Pose ou règle la règle générale** — `PUT admin/order-cutoffs/general`.
 *
 * Charge la règle, la pose ({@link GeneralOrderCutoffRule.define}) ou la règle
 * ({@link GeneralOrderCutoffRule.redefine}), la range. Le refus d'un point ou
 * d'un jour vit dans l'entité. Le fait reste `order_cutoff.created` /
 * `order_cutoff.updated`, comme avant le 2026-10-21 : le journal se relit d'un
 * seul tenant.
 */
@CommandHandler(DefineGeneralOrderCutoffCommand)
export class DefineGeneralOrderCutoffHandler implements ICommandHandler<
  DefineGeneralOrderCutoffCommand,
  void
> {
  constructor(
    private readonly repository: GeneralOrderCutoffRepository,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DefineGeneralOrderCutoffCommand): Promise<void> {
    await this.uow.run(async () => {
      const current = await this.repository.load();
      const rule =
        current === null
          ? GeneralOrderCutoffRule.define(this.ids.next(), command.payload)
          : current.redefine(command.payload);
      await this.repository.save(rule);
      const event =
        current === null
          ? new OrderCutoffCreatedEvent(rule.id, command.payload, null)
          : new OrderCutoffUpdatedEvent(rule.id, command.payload, null);
      await this.events.publishTraced(event);
    });
  }
}
