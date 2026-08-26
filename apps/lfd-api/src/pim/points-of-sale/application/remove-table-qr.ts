import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PointOfSaleRepository } from "../domain/ports/point-of-sale.repository.js";
import { PointOfSaleTableNotFoundError } from "../domain/errors/points-of-sale-errors.js";
import { requirePointOfSale } from "./point-of-sale-support.js";

export class RemoveTableQrCommand {
  constructor(
    readonly pointOfSaleId: string,
    readonly tableNumber: number,
  ) {}
}

/** Retire le QR d'une table : le code imprimé cesse d'ouvrir quoi que ce soit. */
@CommandHandler(RemoveTableQrCommand)
export class RemoveTableQrHandler implements ICommandHandler<RemoveTableQrCommand, void> {
  constructor(
    private readonly points: PointOfSaleRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveTableQrCommand): Promise<void> {
    const pointOfSale = await requirePointOfSale(this.points, command.pointOfSaleId);
    if (!pointOfSale.detachQr(command.tableNumber)) {
      throw new PointOfSaleTableNotFoundError(command.pointOfSaleId, command.tableNumber);
    }
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.pointOfSaleTableQrRemoved,
        subjectType: "point_of_sale",
        subjectId: command.pointOfSaleId,
        payload: { table: command.tableNumber },
      });
      await this.points.save(pointOfSale, ticket);
    });
  }
}
