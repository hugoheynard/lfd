import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";
import { requireEmplacement, requireTable } from "./emplacement-support.js";

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
    requireTable(emplacement, command.tableNumber);
    await this.emplacements.setTableQr(command.emplacementId, command.tableNumber, false, null);
  }
}
