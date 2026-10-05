import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { PackingOrderPackedEvent } from "../../../production/channels/packing/index.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { lockedSheet } from "../containers/container-support.js";
import { ClosePackingOrderCommand } from "./close-packing-order.command.js";

/**
 * **Fermer le bac** — « Déclarer prête », servi par le colisage lui-même (plan
 * `colisage/plan-domaine-colisage.md`, §17.2, K3a), sans détour par le fournil.
 *
 * Le bac verrouillé, fermé par l'agrégat (toutes les lignes réparties sur une
 * commande `listed`), et `packing.order_packed` écrit dans la même transaction.
 *
 * ## Les trois cas de « déjà fermé », et pourquoi ils ne se ressemblent pas
 *
 * - **Première fermeture** : le fait part sous la clé de la commande
 *   (`packing.order_packed:<orderId>`), le commerce la rend prête.
 * - **Refermer après « Rouvrir »** : l'agrégat la voit ouverte, donc la ferme
 *   — et le fait part sous la MÊME clé, que la boîte d'envoi absorbe
 *   (`ON CONFLICT (key) DO NOTHING`). Rien de neuf n'arrive au commerce, qui
 *   la tenait toujours « prête » (§17.2).
 * - **Fermer un bac déjà fermé** : la réannonce de l'ancien poste — le fait
 *   d'origine republié sous une clé neuve, même instant et même auteur. C'est
 *   le filet humain d'un abonné perdu ; sans danger, le commerce ne fait rien
 *   sur une commande déjà prête.
 *
 * @sans-journal comme `PackOrderHandler` : `order.ready` est écrit par
 * l'abonné du commerce ; un second fait ici doublerait son écrivain.
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {UnallocatedLinesError}
 */
@CommandHandler(ClosePackingOrderCommand)
export class ClosePackingOrderHandler implements ICommandHandler<ClosePackingOrderCommand, void> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly durable: DurablePublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ClosePackingOrderCommand): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      const now = this.clock.now();
      const sealed = sheet.seal({ at: now, by: command.staffUserId });
      if (sealed.fresh) {
        await this.sheets.save(sheet);
      }
      await this.durable.publish(
        new PackingOrderPackedEvent(
          sheet.orderId,
          sheet.reference,
          sealed.mark.at,
          sealed.mark.by,
          sealed.fresh ? null : now,
        ).durableFact(),
      );
    });
  }
}
