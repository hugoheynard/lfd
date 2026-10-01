import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DriverRoundWall } from "../../domain/ports/driver-round-wall.js";
import { assertDriverRound } from "../driver-loading-support.js";
import { UnloadDeliveryBinHandler } from "./unload-delivery-bin.handler.js";
import { UnloadDeliveryBinCommand } from "./unload-delivery-bin.command.js";
import { UnloadMyBinCommand } from "./unload-my-bin.command.js";

/**
 * **Décharger un bac de MA tournée** (`parcours-du-livreur.md`, PL1) — le
 * scan raté se reprend. Le mur du livreur, puis LA MÊME commande que l'écran
 * de chargement (`UnloadDeliveryBinCommand`), dans une unité de travail.
 *
 * @sans-journal il délègue à `UnloadDeliveryBinHandler`, qui publie le fait dans la même
 *   unité de travail — le tracer ici l'écrirait deux fois.
 *
 * @throws {DriverRoundNotFoundError} tournée absente ou à un autre ; et tout ce
 *   que lève `UnloadDeliveryBinHandler`.
 */
@CommandHandler(UnloadMyBinCommand)
export class UnloadMyBinHandler implements ICommandHandler<UnloadMyBinCommand, void> {
  constructor(
    private readonly wall: DriverRoundWall,
    private readonly inner: UnloadDeliveryBinHandler,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UnloadMyBinCommand): Promise<void> {
    await this.uow.run(async () => {
      await assertDriverRound(this.wall, command.staffUserId, command.roundId);
      await this.inner.execute(new UnloadDeliveryBinCommand(command.roundId, command.binId));
    });
  }
}
