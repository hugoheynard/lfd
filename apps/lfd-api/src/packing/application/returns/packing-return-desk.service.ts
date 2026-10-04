import { Injectable } from "@nestjs/common";

import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { PackingReturnedEvent } from "../../../production/channels/packing/index.js";
import {
  PackingReturnLedger,
  PackingReturnReader,
  type ReturnToDecide,
} from "../../domain/ports/packing-return.ledger.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";

/**
 * **Le guichet des retours** — le colisage tranche ce que le fournil lui
 * redemande (plan `colisage/plan-domaine-colisage.md`, §10.2, §13 B2, K2).
 *
 * Partagé par deux abonnés : la demande qui arrive (`OnReturnRequested`), et la
 * remise qui arrive après elle (`OnHandedToPacking`) — l'ordre des faits n'est
 * pas garanti (§11, B3). La règle « une demande se tranche une fois, sous le
 * verrou de la réserve, et sa réponse part avec la décision » s'écrit ici, une
 * fois.
 *
 * Tourne dans l'unité de travail que la garde du relais ouvre pour la livraison.
 */
@Injectable()
export class PackingReturnDesk {
  constructor(
    private readonly ledger: PackingReturnLedger,
    private readonly reader: PackingReturnReader,
    private readonly stocks: PackingStockRepository,
    private readonly durable: DurablePublisher,
    private readonly clock: Clock,
  ) {}

  /**
   * Une demande arrive. Si sa remise est connue, elle est tranchée tout de
   * suite ; sinon (« remise inconnue »), elle attend, et le fournil ne republie
   * rien (§13, MINEURS). Un rejeu de la même demande ne fait rien.
   */
  async receive(request: ReturnToDecide): Promise<void> {
    const fresh = await this.ledger.record(request);
    if (fresh && (await this.reader.isHandoffReceived(request.handoffId))) {
      await this.decide(request);
    }
  }

  /** La remise d'une fournée vient d'arriver : les demandes qui l'attendaient sont tranchées. */
  async settlePending(handoffId: string): Promise<void> {
    for (const request of await this.reader.pendingFor(handoffId)) {
      await this.decide(request);
    }
  }

  /** Rend ce qui n'est pas au bac, au plus ce qui est demandé — et répond. */
  private async decide(request: ReturnToDecide): Promise<void> {
    const stock = await this.stocks.lock(request.serviceDay, request.sku);
    const returned = stock.giveBack(request.requested);
    await this.stocks.save(stock);
    const decidedAt = this.clock.now();
    await this.ledger.decide(request.requestId, returned, decidedAt);
    await this.durable.publish(
      new PackingReturnedEvent(
        request.requestId,
        request.serviceDay,
        returned,
        decidedAt,
      ).durableFact(),
    );
  }
}
