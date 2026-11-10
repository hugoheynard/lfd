import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompletedOrderReader } from "../../../orders/domain/ports/completed-order.reader.js";
import { LoyaltySettingsReader } from "../../domain/ports/loyalty-settings.store.js";
import { OrderPointsCrediting } from "../services/order-points-crediting.js";
import { CREDIT_BATCH } from "./credit-pending-order-points.handler.js";
import { CreditClaimedGuestPointsCommand } from "./credit-claimed-guest-points.command.js";

/**
 * Le rattrapage, borné à UNE personne : ses commandes définitives qui n'ont
 * pas leur gain. Rien de neuf sur la règle — `earningFor` décide comme
 * partout (R4 : rien avant l'ouverture au public ; programme fermé : rien), et
 * l'index unique `(order_id) WHERE kind = 'earned'` interdit un second gain si
 * la nuit passe en même temps.
 *
 * `@hors-transaction` le passage entier, pour la raison du rattrapage : chaque
 * gain ouvre SA transaction dans `OrderPointsCrediting`, et y trace son fait.
 */
@CommandHandler(CreditClaimedGuestPointsCommand)
export class CreditClaimedGuestPointsHandler implements ICommandHandler<
  CreditClaimedGuestPointsCommand,
  number
> {
  constructor(
    private readonly orders: CompletedOrderReader,
    private readonly settings: LoyaltySettingsReader,
    private readonly crediting: OrderPointsCrediting,
  ) {}

  async execute(command: CreditClaimedGuestPointsCommand): Promise<number> {
    const settings = await this.settings.read();
    if (settings === null) {
      return 0;
    }
    let after: string | null = null;
    let credited = 0;
    do {
      const page = await this.orders.listCompletedPlacedBy(command.userId, after, CREDIT_BATCH);
      credited += await this.crediting.creditPending(page.orders, settings);
      after = page.nextAfter;
    } while (after !== null);
    return credited;
  }
}
