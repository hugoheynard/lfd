import { Injectable } from "@nestjs/common";

import { DomainEventPublisher } from "../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../platform/id/id-generator.js";
import { Clock } from "../../platform/time/clock.js";
import { FrozenResuppliesReader } from "../../production/channels/delivery/index.js";
import { TransferOrdersReader } from "../channels/commerce/index.js";
import { InternalTransfer, type TransferItem } from "../domain/entities/internal-transfer.js";
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
 *
 * **Le réassort** (lot R3c, 2026-10-21) : un second chemin, à côté des
 * commandes. Les réassorts FIGÉS par l'arrêt — les `resupplyIds` du fait,
 * jamais l'état vivant du commerce — d'un point servi par transfert entrent
 * dans le transfert prévu de ce point, ouvert au besoin : un point sans
 * commande ce jour-là reçoit quand même le sien. Un point servi sur place (le
 * Labo) n'a pas de transfert.
 */
@Injectable()
export class TransferAttachment {
  constructor(
    private readonly orders: TransferOrdersReader,
    private readonly resupplies: FrozenResuppliesReader,
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
      if (await this.attach({ kind: "order", orderId: ref.orderId }, ref)) {
        attached += 1;
      }
    }
    return attached;
  }

  /** Rend le nombre de réassorts rangés par cet appel. */
  async attachResupplies(serviceDay: string, resupplyIds: readonly string[]): Promise<number> {
    if (resupplyIds.length === 0) {
      return 0;
    }
    const frozen = await this.resupplies.frozenOf(serviceDay, resupplyIds);
    let attached = 0;
    for (const resupply of frozen.filter((candidate) => candidate.servedByTransfer)) {
      const item = { kind: "resupply", resupplyId: resupply.resupplyId } as const;
      // Un nom inconnu à l'arrêt : le transfert garde l'identifiant du point,
      // seule chose sûre (le nom ne se devine pas).
      const site = { siteId: resupply.siteId, siteLabel: resupply.siteLabel ?? resupply.siteId };
      if (await this.attach(item, { ...site, day: resupply.serviceDay })) {
        attached += 1;
      }
    }
    return attached;
  }

  /**
   * **Le plan rouvert : ses réassorts sortent** (lot R3c, symétrique de
   * l'attache) — de leur transfert tant qu'il est prévu ; parti ou reçu, rien
   * ne bouge (le fournil a refusé la réouverture si une tournée était partie).
   * Le transfert reste, même vide : un nouvel arrêt y rangera de nouveau.
   * Rend le nombre de réassorts sortis.
   */
  async detachResupplies(resupplyIds: readonly string[]): Promise<number> {
    let detached = 0;
    for (const resupplyId of resupplyIds) {
      const item = { kind: "resupply", resupplyId } as const;
      const holderId = await this.transfers.holderOf(item);
      const holder = holderId === null ? null : await this.transfers.load(holderId);
      if (holder !== null && holder.detach(item, this.clock.now()) === "detached") {
        await this.transfers.save(holder);
        detached += 1;
      }
    }
    return detached;
  }

  private async attach(
    item: TransferItem,
    ref: { readonly day: string; readonly siteId: string; readonly siteLabel: string },
  ): Promise<boolean> {
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
