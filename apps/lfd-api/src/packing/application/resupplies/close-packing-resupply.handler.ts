import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import type { PackingResupply } from "../../domain/entities/packing-resupply.js";
import { PackingResupplyRepository } from "../../domain/ports/packing-resupply.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { ClosePackingResupplyCommand } from "./close-packing-resupply.command.js";
import { lockedResupply } from "./resupply-support.js";

/**
 * **Clore une fiche de réassort** (réassort, lot R3b) : l'emballé de chaque
 * ligne devient définitif, et `PackedResuppliesReader` le rend au commerce,
 * qui pré-remplit sa réception. Aucun fait : le commerce LIT, à la réception.
 * Une fiche déjà close n'est pas réécrite.
 *
 * La clôture LÈVE la réservation d'une fiche « au plus tôt » (R4b) : l'emballé
 * l'a consommée, et ce qui n'a pas été emballé redevient libre pour les
 * commandes. Ordre des verrous : la fiche, puis les réserves par SKU.
 *
 * @throws {PackingResupplyNotDrawnError} @throws {PackingResupplyIncompleteError}
 */
@CommandHandler(ClosePackingResupplyCommand)
export class ClosePackingResupplyHandler implements ICommandHandler<
  ClosePackingResupplyCommand,
  void
> {
  constructor(
    private readonly resupplies: PackingResupplyRepository,
    private readonly stocks: PackingStockRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ClosePackingResupplyCommand): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedResupply(this.resupplies, command.serviceDay, command.resupplyId);
      const at = this.clock.now();
      if (sheet.close({ at, by: command.staffUserId })) {
        await this.resupplies.save(sheet);
        await this.liftReservations(sheet, at);
      }
    });
  }

  private async liftReservations(sheet: PackingResupply, at: Date): Promise<void> {
    if (sheet.kind !== "asap") {
      return;
    }
    const skus = sheet.lines.map((line) => line.sku).sort((a, b) => a.localeCompare(b));
    for (const sku of skus) {
      const stock = await this.stocks.lock(sheet.serviceDay, sku);
      if (stock.lift(sheet.resupplyId, at)) {
        await this.stocks.save(stock);
      }
    }
  }
}
