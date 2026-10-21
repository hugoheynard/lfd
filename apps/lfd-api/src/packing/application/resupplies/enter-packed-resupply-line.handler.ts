import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { PackingResupplyRepository } from "../../domain/ports/packing-resupply.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { EnterPackedResupplyLineCommand } from "./enter-packed-resupply-line.command.js";
import { lockedResupply } from "./resupply-support.js";

/**
 * **Saisir l'emballé d'une ligne de réassort** (réassort, lot R3b) — 0 permis,
 * jamais plus que demandé (l'agrégat refuse).
 *
 * Les pièces emballées sortent de la réserve du jour comme une mise au bac :
 * la réserve `(jour, SKU)` les prend (ou les rend si la saisie baisse), sous
 * son verrou. Le fournil ne reprend donc pas en retour ce qui part au point,
 * et on n'emballe pas ce qui n'est pas sorti du four. Ordre des verrous :
 * la fiche, puis la réserve — celui des bacs.
 *
 * @throws {PackingResupplyNotDrawnError} @throws {PackingResupplyClosedError}
 * @throws {PackingResupplyLineNotFoundError} @throws {PackedResupplyQuantityOutOfRangeError}
 * @throws {LineNotProducedYetError} la réserve ne couvre pas la hausse.
 */
@CommandHandler(EnterPackedResupplyLineCommand)
export class EnterPackedResupplyLineHandler implements ICommandHandler<
  EnterPackedResupplyLineCommand,
  void
> {
  constructor(
    private readonly resupplies: PackingResupplyRepository,
    private readonly stocks: PackingStockRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: EnterPackedResupplyLineCommand): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedResupply(this.resupplies, command.serviceDay, command.resupplyId);
      const change = sheet.enterPacked(command.sku, command.quantity, {
        at: this.clock.now(),
        by: command.staffUserId,
      });
      if (change.delta !== 0) {
        const stock = await this.stocks.lock(command.serviceDay, change.sku);
        if (change.delta > 0) {
          stock.take(change.delta, change.productName);
        } else {
          stock.release(-change.delta);
        }
        await this.stocks.save(stock);
      }
      await this.resupplies.save(sheet);
    });
  }
}
