import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ReservationCompanyNotFoundError } from "../../domain/errors/made-to-order-errors.js";
import { ReservationChangedEvent } from "../../domain/events/made-to-order.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { CatalogReservations } from "../../domain/ports/catalog-reservations.js";
import { ReservationCompanies } from "../../domain/ports/reservation-companies.js";
import { loadOrFail, subjectOf } from "./catalog-decision-support.js";
import { ReserveArticleCommand } from "./reserve-article.command.js";

/**
 * Réserve un article à une société. Réserver deux fois est sans effet, et
 * n'écrit pas de second fait.
 *
 * @throws {CatalogItemNotFoundError} le SKU n'est plus au catalogue.
 * @throws {ReservationCompanyNotFoundError} la société n'existe pas.
 */
@CommandHandler(ReserveArticleCommand)
export class ReserveArticleHandler implements ICommandHandler<ReserveArticleCommand, void> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly reservations: CatalogReservations,
    private readonly companies: ReservationCompanies,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: ReserveArticleCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const companyName = await this.companies.nameOf(command.companyId);
      if (companyName === null) {
        throw new ReservationCompanyNotFoundError(command.companyId);
      }
      const reserved = await this.reservations.reserve({
        sku: command.sku,
        companyId: command.companyId,
        reservedAt: this.clock.now(),
        reservedBy: command.reservedBy,
      });
      if (reserved) {
        await this.events.publishTraced(
          new ReservationChangedEvent(
            subjectOf(item),
            { companyId: command.companyId, companyName },
            true,
          ),
        );
      }
    });
  }
}
