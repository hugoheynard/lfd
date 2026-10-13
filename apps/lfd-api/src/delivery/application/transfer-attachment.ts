import { Injectable } from "@nestjs/common";

import { DomainEventPublisher } from "../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../platform/id/id-generator.js";
import { Clock } from "../../platform/time/clock.js";
import { type TransferOrderRef, TransferOrdersReader } from "../channels/commerce/index.js";
import { InternalTransfer } from "../domain/entities/internal-transfer.js";
import { InternalTransferOpenedEvent } from "../domain/events/internal-transfer.events.js";
import { InternalTransferRepository } from "../domain/ports/internal-transfer.repository.js";

/**
 * **Chaque commande d'un site servi par transfert a un transfert** (plan du
 * transfert interne, §3, §6, lot T1) — rangée dans le transfert PRÉVU de son
 * site et de son jour, ou dans un nouveau quand aucun n'est prévu : le
 * premier du jour, ou un autre quand le premier est déjà parti (Q-T3,
 * « autant de transferts que nécessaire »).
 *
 * Idempotent : une commande déjà dans un transfert n'est pas reprise (une
 * commande n'est que dans un transfert, la base le tient). Appelé DANS la
 * transaction des abonnés à l'arrêt du plan et au retirage — aucune lecture
 * réseau ici. Une commande qui n'est pas un retrait actif d'un site servi par
 * transfert ne fait rien : c'est le commerce qui le décide, par son canal.
 */
@Injectable()
export class TransferAttachment {
  constructor(
    private readonly orders: TransferOrdersReader,
    private readonly transfers: InternalTransferRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  /** Rend le nombre de commandes rangées par cet appel. */
  async attachAmong(orderIds: readonly string[]): Promise<number> {
    if (orderIds.length === 0) {
      return 0;
    }
    const refs = await this.orders.transferOrdersAmong(orderIds);
    let attached = 0;
    for (const ref of refs) {
      if (await this.attach(ref)) {
        attached += 1;
      }
    }
    return attached;
  }

  private async attach(ref: TransferOrderRef): Promise<boolean> {
    const item = { kind: "order", orderId: ref.orderId } as const;
    if ((await this.transfers.holderOf(item)) !== null) {
      return false;
    }
    const at = this.clock.now();
    const [planned] = await this.transfers.plannedOf(ref.day, ref.siteId);
    const transfer =
      planned ??
      InternalTransfer.plan({
        id: this.ids.next(),
        serviceDay: ref.day,
        siteId: ref.siteId,
        siteLabel: ref.siteLabel,
        at,
      });
    transfer.attach(
      { itemId: this.ids.next(), item },
      { siteId: ref.siteId, serviceDay: ref.day },
      at,
    );
    await this.transfers.save(transfer);
    if (planned === undefined) {
      await this.events.publishTraced(new InternalTransferOpenedEvent(transfer));
    }
    return true;
  }
}
