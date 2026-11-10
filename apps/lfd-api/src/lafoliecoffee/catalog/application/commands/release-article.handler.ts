import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ReservationChangedEvent } from "../../domain/events/made-to-order.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { CatalogReservations } from "../../domain/ports/catalog-reservations.js";
import { ReservationCompanies } from "../../domain/ports/reservation-companies.js";
import { loadOrFail, subjectOf } from "./catalog-decision-support.js";
import { ReleaseArticleCommand } from "./release-article.command.js";

/**
 * Retire la réservation d'un article à une société. Retirer ce qui n'est pas
 * réservé est sans effet, et n'écrit pas de fait.
 *
 * La société n'a pas à exister encore pour qu'on retire sa ligne : une
 * réservation orpheline doit pouvoir partir. Son fait porte alors un nom
 * `null`, jamais un nom inventé.
 *
 * @throws {CatalogItemNotFoundError} le SKU n'est plus au catalogue.
 */
@CommandHandler(ReleaseArticleCommand)
export class ReleaseArticleHandler implements ICommandHandler<ReleaseArticleCommand, void> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly reservations: CatalogReservations,
    private readonly companies: ReservationCompanies,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReleaseArticleCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const released = await this.reservations.release(command.sku, command.companyId);
      if (released) {
        const companyName = await this.companies.nameOf(command.companyId);
        await this.events.publishTraced(
          new ReservationChangedEvent(
            subjectOf(item),
            { companyId: command.companyId, companyName },
            false,
          ),
        );
      }
    });
  }
}
