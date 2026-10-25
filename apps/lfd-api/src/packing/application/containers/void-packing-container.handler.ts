import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { lockedSheet } from "./container-support.js";
import { PackingContainerVoiding } from "./packing-container-voiding.js";
import { VoidPackingContainerCommand } from "./void-packing-container.command.js";

/**
 * **Annule un contenant** (K2b, §5.1) — jamais de suppression : il porte
 * `voided_at`, ses lignes restent, ignorées, et ce qu'il portait retourne à
 * répartir.
 *
 * Un BAC s'annule d'abord chez la livraison, par `BinDesk`, dans cette unité
 * de travail : elle refuse un bac chargé ou une tournée partie, et alors rien
 * n'est écrit ici non plus. Le geste lui-même vit dans
 * {@link PackingContainerVoiding}, partagé avec le retrait d'une feuille (A1).
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {PackedOrderSealedError}
 * @throws {ContainersCountedError} @throws {PackingContainerNotFoundError}
 * @throws {PackingContainerVoidedError} @throws {PackingSheetWithdrawnError}
 *   et les refus de la livraison pour un bac.
 */
@CommandHandler(VoidPackingContainerCommand)
export class VoidPackingContainerHandler implements ICommandHandler<
  VoidPackingContainerCommand,
  void
> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly voiding: PackingContainerVoiding,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: VoidPackingContainerCommand): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      await this.voiding.voidAll(sheet, [command.containerId], {
        at: this.clock.now(),
        by: command.staffUserId,
      });
      await this.sheets.save(sheet);
    });
  }
}
