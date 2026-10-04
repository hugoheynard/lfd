import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  PackingOrderPackedEvent,
  PackingStation,
  type StationLineMark,
  type StationOrderRef,
  type StationSeal,
  type StationSealAck,
} from "../../../production/channels/packing/index.js";
import type { PackingSheet } from "../../domain/entities/packing-sheet.js";
import { PackingOrderNotDrawnYetError } from "../../domain/errors/packing-station-errors.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";

/**
 * **Le poste de colisage d'une journée `packing`** — ce que le fournil lui
 * remet après ses refus structurels (plan `colisage/plan-domaine-colisage.md`,
 * K2, §12.2, §13).
 *
 * Chaque geste tient dans UNE unité de travail : le bac verrouillé, puis la
 * réserve de l'article verrouillée — toujours dans cet ordre, la décision de
 * retour ne prenant que la réserve —, les deux agrégats mutés, rendus. La
 * fermeture publie `packing.order_packed` dans la même transaction.
 *
 * Rend `void` sauf la fermeture, dont l'accusé est le contrat déjà servi.
 */
@Injectable()
export class PackingStationService extends PackingStation {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly stocks: PackingStockRepository,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly clock: Clock,
  ) {
    super();
  }

  async markLine(order: StationOrderRef, sku: string, mark: StationLineMark): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await this.sheetOf(order);
      const line = sheet.lineToTouch(sku);
      if (line.packed === null) {
        const stock = await this.stocks.lock(order.serviceDay, sku);
        stock.take(line.quantity, line.productName);
        await this.stocks.save(stock);
      }
      sheet.put(sku, mark);
      await this.sheets.save(sheet);
    });
  }

  async unmarkLine(order: StationOrderRef, sku: string): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await this.sheetOf(order);
      const released = sheet.takeOut(sku);
      if (released > 0) {
        const stock = await this.stocks.lock(order.serviceDay, sku);
        stock.release(released);
        await this.stocks.save(stock);
      }
      await this.sheets.save(sheet);
    });
  }

  async seal(order: StationOrderRef, mark: StationSeal): Promise<StationSealAck> {
    return this.uow.run(async () => {
      const sheet = await this.sheetOf(order);
      const sealed = sheet.seal(mark);
      if (sealed.fresh) {
        await this.sheets.save(sheet);
      }
      // Un bac déjà fermé republie son fait sous une clé NEUVE, avec l'heure et
      // l'auteur d'origine : le rescan reste le filet humain, comme avant.
      const reannouncedAt = sealed.fresh ? null : this.clock.now();
      await this.durable.publish(
        new PackingOrderPackedEvent(
          sheet.orderId,
          sheet.reference,
          sealed.mark.at,
          sealed.mark.by,
          reannouncedAt,
        ).durableFact(),
      );
      return { packedAt: sealed.mark.at, packedBy: sealed.mark.by, alreadyPacked: !sealed.fresh };
    });
  }

  async stepContainers(order: StationOrderRef, step: "add" | "remove"): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await this.sheetOf(order);
      sheet.step(step);
      await this.sheets.save(sheet);
    });
  }

  async declareContainers(order: StationOrderRef, containers: number): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await this.sheetOf(order);
      sheet.declareContainers(containers);
      await this.sheets.save(sheet);
    });
  }

  private async sheetOf(order: StationOrderRef): Promise<PackingSheet> {
    const sheet = await this.sheets.lock(order.serviceDay, order.orderId);
    if (sheet === null) {
      throw new PackingOrderNotDrawnYetError(order.reference);
    }
    return sheet;
  }
}
