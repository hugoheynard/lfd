import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CatalogPricesRetracedEvent } from "../../domain/events/catalog-price-history.events.js";
import { CatalogPriceRetracer } from "../../domain/ports/catalog-price-retracer.js";
import { RetracePricesFromReferentialCommand } from "./retrace-prices-from-referential.command.js";

/**
 * Retrace le prix du référentiel, et journalise ce qui a été retracé — dans
 * la même unité de travail : un journal en panne annule le retraçage.
 *
 * Idempotent par construction : la trace ne s'écrit que sur un écart, et un
 * second appel n'en trouve plus. Un appel sans écart n'écrit **aucun** fait —
 * il dirait qu'un prix a bougé alors que rien n'a bougé.
 */
@CommandHandler(RetracePricesFromReferentialCommand)
export class RetracePricesFromReferentialHandler implements ICommandHandler<
  RetracePricesFromReferentialCommand,
  void
> {
  constructor(
    private readonly retracer: CatalogPriceRetracer,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<void> {
    await this.uow.run(async () => {
      const skus = await this.retracer.retrace(this.clock.now());
      if (skus.length > 0) {
        await this.events.publishTraced(new CatalogPricesRetracedEvent(skus));
      }
    });
  }
}
