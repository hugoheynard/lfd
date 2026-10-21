import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { PackingResupplyRepository } from "../../domain/ports/packing-resupply.repository.js";
import { ClosePackingResupplyCommand } from "./close-packing-resupply.command.js";
import { lockedResupply } from "./resupply-support.js";

/**
 * **Clore une fiche de réassort** (réassort, lot R3b) : l'emballé de chaque
 * ligne devient définitif, et `PackedResuppliesReader` le rend au commerce,
 * qui pré-remplit sa réception. Aucun fait : le commerce LIT, à la réception.
 * Une fiche déjà close n'est pas réécrite.
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
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ClosePackingResupplyCommand): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedResupply(this.resupplies, command.serviceDay, command.resupplyId);
      if (sheet.close({ at: this.clock.now(), by: command.staffUserId })) {
        await this.resupplies.save(sheet);
      }
    });
  }
}
