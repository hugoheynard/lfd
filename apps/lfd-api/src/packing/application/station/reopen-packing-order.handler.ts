import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { BinDesk } from "../../channels/delivery/index.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { lockedSheet } from "../containers/container-support.js";
import { ReopenPackingOrderCommand } from "./reopen-packing-order.command.js";

/**
 * **Rouvrir le rangement** d'une commande fermée (plan
 * `colisage/colisage.md`, §17.2 — option b de Hugo).
 *
 * Le bac verrouillé ; la livraison vérifie d'abord, dans la même unité de
 * travail, qu'aucun de ses bacs vivants n'est chargé et que sa tournée n'est
 * pas partie (`BinDesk.assertAtHand`) — sinon rien n'est écrit. Puis l'agrégat
 * rouvre.
 *
 * Seul le rangement rouvre : la commande reste « prête » au commerce et AUCUN
 * fait n'est publié. La refermer republie la même clé, absorbée
 * (`ClosePackingOrderHandler`). Rouvrir un bac déjà ouvert n'écrit rien.
 *
 * @sans-journal le plan (§17.2) ne nomme pas de fait pour ce geste, et le
 * journal n'a pas de type pour lui ; remonté au plan (K3a) plutôt qu'inventé.
 *
 * @throws {PackingOrderNotDrawnYetError} et les refus de la livraison
 *   (`BinLoadedError`, `DeliveryRoundDepartedError`).
 */
@CommandHandler(ReopenPackingOrderCommand)
export class ReopenPackingOrderHandler implements ICommandHandler<ReopenPackingOrderCommand, void> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly desk: BinDesk,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReopenPackingOrderCommand): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      if (sheet.packed === null) {
        return;
      }
      await this.desk.assertAtHand(sheet.orderId, sheet.liveBinIds);
      sheet.reopen();
      await this.sheets.save(sheet);
    });
  }
}
