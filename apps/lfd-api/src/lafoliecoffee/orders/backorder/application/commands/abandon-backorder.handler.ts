import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import {
  BackorderNotFoundError,
  BackorderOriginNotFoundError,
} from "../../domain/errors/backorder-errors.js";
import { BackorderOriginNumberReader } from "../../domain/ports/backorder-origin-number.reader.js";
import { BackorderRepository } from "../../domain/ports/backorder.repository.js";
import { BackorderAbandonment } from "../backorder-abandonment.js";
import { AbandonBackorderCommand } from "./abandon-backorder.command.js";

/**
 * **Abandonne un reliquat** : dans une unité de travail, le verrou du
 * reliquat (une transformation concurrente attend, puis lit l'état fermé),
 * l'abandon par l'agrégat, l'écriture et le fait `backorder.abandoned`.
 * Rejoué, l'agrégat refuse : {@link BackorderClosedError}, rien d'écrit.
 */
@CommandHandler(AbandonBackorderCommand)
export class AbandonBackorderHandler implements ICommandHandler<AbandonBackorderCommand, void> {
  constructor(
    private readonly backorders: BackorderRepository,
    private readonly origins: BackorderOriginNumberReader,
    private readonly abandonment: BackorderAbandonment,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /**
   * @throws {BackorderNotFoundError} reliquat inconnu.
   * @throws {BackorderClosedError} déjà transformé ou abandonné.
   */
  async execute(command: AbandonBackorderCommand): Promise<void> {
    await this.unitOfWork.run(async () => {
      const locked = await this.backorders.loadLocked(command.backorderId);
      if (locked === null) {
        throw new BackorderNotFoundError(command.backorderId);
      }
      const reference = await this.origins.numberOf(locked.originOrderId);
      if (reference === null) {
        throw new BackorderOriginNotFoundError(locked.originOrderId);
      }
      await this.abandonment.abandon(locked, reference, command.staffUserId);
    });
  }
}
