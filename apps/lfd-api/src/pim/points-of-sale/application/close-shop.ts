import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PointOfSaleRepository } from "../domain/ports/point-of-sale.repository.js";
import { RootPointOfSaleProtectedError } from "../domain/errors/points-of-sale-errors.js";
import { isRootPointOfSale } from "../domain/value-objects/bootstrap-point-of-sale.js";
import { requirePointOfSale } from "./point-of-sale-support.js";

export class CloseShopCommand {
  constructor(readonly id: string) {}
}

/**
 * Supprime un point de vente — **sauf** la plateforme racine, et **sauf** si des
 * familles y vendent encore.
 *
 * Le second refus n'est pas prononcé ici : c'est la clé étrangère `Restrict` de
 * `category_channel`, traduite par le dépôt. Une lecture ne tiendrait rien —
 * entre le compte et la suppression, une famille peut se mettre à vendre.
 */
@CommandHandler(CloseShopCommand)
export class CloseShopHandler implements ICommandHandler<CloseShopCommand, void> {
  constructor(
    private readonly points: PointOfSaleRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CloseShopCommand): Promise<void> {
    if (isRootPointOfSale(command.id)) {
      throw new RootPointOfSaleProtectedError();
    }
    const pointOfSale = await requirePointOfSale(this.points, command.id);
    const { label, tables } = pointOfSale.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.pointOfSaleDeleted,
        subjectType: "point_of_sale",
        subjectId: command.id,
        // Après elle, la ligne n'est plus interrogeable : le journal est le seul
        // endroit où le point de vente a encore un nom. On y verse donc le nom
        // ET le nombre de tables — c'est-à-dire combien de QR imprimés viennent
        // de cesser d'ouvrir quoi que ce soit.
        payload: { label, tableCount: tables.length },
      });
      await this.points.remove(command.id, ticket);
    });
  }
}
