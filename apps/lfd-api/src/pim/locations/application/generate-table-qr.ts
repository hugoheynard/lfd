import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { LocationRepository } from "../domain/ports/location.repository.js";
import { TableTokenGenerator } from "../domain/ports/table-token-generator.js";
import { LocationTableNotFoundError } from "../domain/errors/locations-errors.js";
import { requireLocation } from "./location-support.js";

export class GenerateTableQrCommand {
  constructor(
    readonly locationId: string,
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
    private readonly locations: LocationRepository,
    private readonly tokens: TableTokenGenerator,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: GenerateTableQrCommand): Promise<string> {
    const location = await requireLocation(this.locations, command.locationId);
    const token = this.tokens.next();
    // L'agrégat sait si la table existe ; le handler traduit ce « non » en 404.
    if (!location.attachQr(command.tableNumber, token)) {
      throw new LocationTableNotFoundError(command.locationId, command.tableNumber);
    }
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.locationTableQrGenerated,
        subjectType: "location",
        subjectId: command.locationId,
        // Le NUMÉRO de table, jamais le jeton : il vaut accès à la commande à
        // cette table, et un journal se relit plus largement que la table.
        payload: { table: command.tableNumber },
      });
      await this.locations.save(location, ticket);
    });
    return token;
  }
}
