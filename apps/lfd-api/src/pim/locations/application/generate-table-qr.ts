import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";
import { TableTokenGenerator } from "../domain/ports/table-token-generator.js";
import { EmplacementTableNotFoundError } from "../domain/errors/locations-errors.js";
import { requireEmplacement } from "./emplacement-support.js";

export class GenerateTableQrCommand {
  constructor(
    readonly emplacementId: string,
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
    private readonly emplacements: EmplacementRepository,
    private readonly tokens: TableTokenGenerator,
  ) {}

  async execute(command: GenerateTableQrCommand): Promise<string> {
    const emplacement = await requireEmplacement(this.emplacements, command.emplacementId);
    const token = this.tokens.next();
    // L'agrégat sait si la table existe ; le handler traduit ce « non » en 404.
    if (!emplacement.attachQr(command.tableNumber, token)) {
      throw new EmplacementTableNotFoundError(command.emplacementId, command.tableNumber);
    }
    await this.emplacements.save(emplacement);
    return token;
  }
}
