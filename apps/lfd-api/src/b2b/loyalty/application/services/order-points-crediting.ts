import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LoyaltyPointsEarnedEvent } from "../../domain/events/loyalty.events.js";
import { LoyaltyAccountRepository } from "../../domain/ports/loyalty-account.repository.js";
import { LoyaltyEarnedOrdersReader } from "../../domain/ports/loyalty-earned-orders.reader.js";
import { LoyaltyHolderDirectory } from "../../domain/ports/loyalty-holder.directory.js";
import { earningFor, type EarnableOrder } from "../../domain/services/order-earning.js";
import type { LoyaltySettings } from "../../domain/value-objects/loyalty-settings.js";

/**
 * **Écrire le gain d'une commande définitive**, une fois — partagé par
 * l'abonné (une commande) et le rattrapage (des lots), plan D3.
 *
 * L'idempotence tient en deux étages : la relecture « déjà créditée ? » se
 * fait SOUS le verrou du titulaire — une commande a toujours le même
 * titulaire, donc deux crédits concurrents de la même commande s'attendent
 * l'un l'autre et le second ne trouve plus rien à faire ; et l'index partiel
 * `(order_id) WHERE kind = 'earned'` refuse en base ce que ce garde laisserait
 * passer.
 */
@Injectable()
export class OrderPointsCrediting {
  constructor(
    private readonly accounts: LoyaltyAccountRepository,
    private readonly earned: LoyaltyEarnedOrdersReader,
    private readonly holders: LoyaltyHolderDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /** Vrai si ce passage a écrit le gain ; faux si rien n'est dû, ou déjà écrit. */
  async creditEarnedPoints(
    order: EarnableOrder,
    settings: LoyaltySettings | null,
  ): Promise<boolean> {
    const earning = earningFor(order, settings);
    if (earning.kind === "skip") {
      return false;
    }
    const { holder, points } = earning;
    const label = (await this.holders.describe(holder))?.label ?? null;
    return this.uow.run(async () => {
      const account = await this.accounts.loadLocked(holder);
      if ((await this.earned.earnedAmong([order.orderId])).has(order.orderId)) {
        return false;
      }
      account.earn({
        entryId: this.ids.next(),
        orderId: order.orderId,
        points,
        at: this.clock.now(),
      });
      await this.accounts.save(account);
      await this.events.publishTraced(
        new LoyaltyPointsEarnedEvent({ holder, label }, points, {
          id: order.orderId,
          number: order.orderNumber,
        }),
      );
      return true;
    });
  }
}
