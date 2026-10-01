import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DriverRoundWall } from "../../domain/ports/driver-round-wall.js";
import { assertDriverRound } from "../driver-loading-support.js";
import { LoadDeliveryBinHandler } from "./load-delivery-bin.handler.js";
import { LoadDeliveryBinCommand } from "./load-delivery-bin.command.js";
import { LoadMyBinCommand } from "./load-my-bin.command.js";

/**
 * **Charger un bac dans MA tournée** (`parcours-du-livreur.md`, PL1). Le mur
 * du livreur, puis LA MÊME commande que l'écran de chargement
 * (`LoadDeliveryBinCommand`), dans UNE unité de travail : la commande
 * rejoint la transaction où le mur a été lu. Le livreur est l'auteur du
 * chargement. Les refus sont ceux du chargement — un bac d'une autre tournée
 * nomme son véhicule, une tournée partie refuse.
 *
 * @sans-journal il délègue à `LoadDeliveryBinHandler`, qui publie le fait dans la même
 *   unité de travail — le tracer ici l'écrirait deux fois.
 *
 * @throws {DriverRoundNotFoundError} tournée absente ou à un autre ; et tout ce
 *   que lève `LoadDeliveryBinHandler`.
 */
@CommandHandler(LoadMyBinCommand)
export class LoadMyBinHandler implements ICommandHandler<LoadMyBinCommand, void> {
  constructor(
    private readonly wall: DriverRoundWall,
    private readonly inner: LoadDeliveryBinHandler,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: LoadMyBinCommand): Promise<void> {
    await this.uow.run(async () => {
      await assertDriverRound(this.wall, command.staffUserId, command.roundId);
      await this.inner.execute(
        new LoadDeliveryBinCommand(command.roundId, command.payload, command.staffUserId),
      );
    });
  }
}
