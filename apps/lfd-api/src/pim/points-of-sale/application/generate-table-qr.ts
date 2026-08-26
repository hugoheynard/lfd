import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PointOfSaleRepository } from "../domain/ports/point-of-sale.repository.js";
import { TableTokenGenerator } from "../domain/ports/table-token-generator.js";
import { PointOfSaleTableNotFoundError } from "../domain/errors/points-of-sale-errors.js";
import { requirePointOfSale } from "./point-of-sale-support.js";

export class GenerateTableQrCommand {
  constructor(
    readonly pointOfSaleId: string,
    readonly tableNumber: number,
  ) {}
}

/**
 * (Re)génère le QR d'une table : un token neuf remplace l'ancien, invalidant
 * tout QR déjà imprimé. Retourne le token, dont dérive l'URL `…?table=N&k=token`.
 */
@CommandHandler(GenerateTableQrCommand)
export class GenerateTableQrHandler implements ICommandHandler<GenerateTableQrCommand, string> {
  constructor(
    private readonly points: PointOfSaleRepository,
    private readonly tokens: TableTokenGenerator,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: GenerateTableQrCommand): Promise<string> {
    const pointOfSale = await requirePointOfSale(this.points, command.pointOfSaleId);
    const token = this.tokens.next();
    // L'agrégat sait si la table existe ; le handler traduit ce « non » en 404.
    if (!pointOfSale.attachQr(command.tableNumber, token)) {
      throw new PointOfSaleTableNotFoundError(command.pointOfSaleId, command.tableNumber);
    }
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.pointOfSaleTableQrGenerated,
        subjectType: "point_of_sale",
        subjectId: command.pointOfSaleId,
        // Le NUMÉRO de table, jamais le jeton : il vaut accès à la commande à
        // cette table, et un journal se relit plus largement que la table.
        payload: { table: command.tableNumber },
      });
      await this.points.save(pointOfSale, ticket);
    });
    return token;
  }
}
