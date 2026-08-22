import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";
import { EmplacementTableNotFoundError } from "../domain/errors/locations-errors.js";
import { requireEmplacement } from "./emplacement-support.js";

export class RemoveTableQrCommand {
  constructor(
    readonly emplacementId: string,
    readonly tableNumber: number,
  ) {}
}

@CommandHandler(RemoveTableQrCommand)
export class RemoveTableQrHandler implements ICommandHandler<RemoveTableQrCommand, void> {
  constructor(private readonly emplacements: EmplacementRepository) {}

  async execute(command: RemoveTableQrCommand): Promise<void> {
    const emplacement = await requireEmplacement(this.emplacements, command.emplacementId);
    if (!emplacement.detachQr(command.tableNumber)) {
      throw new EmplacementTableNotFoundError(command.emplacementId, command.tableNumber);
    }
    await this.emplacements.save(emplacement);
  }
}
