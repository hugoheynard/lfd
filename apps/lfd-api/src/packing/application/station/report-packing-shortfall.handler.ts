import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { PackingShortfallReportedEvent } from "../../channels/commerce/index.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { lockedSheet } from "../containers/container-support.js";
import { ReportPackingShortfallCommand } from "./report-packing-shortfall.command.js";

/**
 * **« Il manque »** — le colisage signale qu'une commande ne se remplira pas
 * entièrement (lot E6a, `commandes/plan-e6-le-depart-incomplet.md` § 3).
 *
 * Le bac verrouillé, l'agrégat fige ce qui est au bac et retient l'instant ;
 * `packing.shortfall_reported` part dans la même transaction. Un second
 * signalement publie un fait NEUF (clé datée) qui remplace le premier chez le
 * commerce. Le bac reste ouvert : la pièce peut encore arriver, et le fermer
 * complet efface le signal (`ClosePackingOrderHandler`).
 *
 * @sans-journal le commerce écrit l'état de la commande ; un second écrivain
 * ici doublerait le fait, comme pour « Déclarer prête ».
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {PackedOrderSealedError}
 * @throws {ContainersCountedError} @throws {NothingShortError}
 */
@CommandHandler(ReportPackingShortfallCommand)
export class ReportPackingShortfallHandler implements ICommandHandler<
  ReportPackingShortfallCommand,
  void
> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly durable: DurablePublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReportPackingShortfallCommand): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      const now = this.clock.now();
      const lines = sheet.reportShortfall(now);
      await this.sheets.save(sheet);
      await this.durable.publish(
        new PackingShortfallReportedEvent(
          sheet.orderId,
          sheet.reference,
          now,
          command.staffUserId,
          lines.map((line) => ({ sku: line.sku, due: line.due, packed: line.packed })),
        ).durableFact(),
      );
    });
  }
}
