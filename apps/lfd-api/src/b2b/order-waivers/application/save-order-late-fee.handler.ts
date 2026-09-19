import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { LateFeeSetting } from "../../orders/domain/ports/order-late-fee.reader.js";
import { OrderLateFeeSetEvent } from "../domain/order-late-fee.events.js";
import { OrderLateFeeRepository } from "../domain/order-late-fee.repository.js";
import { SaveOrderLateFeeCommand } from "./save-order-late-fee.command.js";

/**
 * **Pose** la surtaxe. L'auteur vient de la requête, jamais du corps : un
 * montant sans auteur ne se relit pas, et laisser l'appelant nommer quelqu'un
 * d'autre rendrait la trace inutile.
 *
 * Journalisé dans la transaction de l'écriture, avec le réglage d'avant (depuis
 * le 2026-09-19) : la ligne est réécrite en place, elle ne garde que le dernier.
 * Une réécriture à l'identique n'est PAS un fait (Hugo, 2026-09-19) : la ligne
 * change d'auteur, mais rien de ce qui est facturé ne bouge — même règle que
 * les décisions de catalogue, où un geste sans effet ne s'écrit pas.
 */
@CommandHandler(SaveOrderLateFeeCommand)
export class SaveOrderLateFeeHandler implements ICommandHandler<SaveOrderLateFeeCommand, void> {
  constructor(
    private readonly fees: OrderLateFeeRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SaveOrderLateFeeCommand): Promise<void> {
    await this.uow.run(async () => {
      const before = await this.fees.read();
      await this.fees.save(command.setting, command.updatedBy);
      if (!sameSetting(before, command.setting)) {
        await this.events.publishTraced(new OrderLateFeeSetEvent(before, command.setting));
      }
    });
  }
}

/** Même montant, même mode, même taux : ce que la passation facturerait est inchangé. */
function sameSetting(before: LateFeeSetting | null, after: LateFeeSetting): boolean {
  if (before === null || before.vatRatePercent !== after.vatRatePercent) {
    return false;
  }
  const [a, b] = [before.adjustment, after.adjustment];
  return a.mode === "amount"
    ? b.mode === "amount" && a.cents === b.cents
    : b.mode === "percent" && a.bp === b.bp;
}
