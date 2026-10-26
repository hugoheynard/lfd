import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  FIRST_SHIPMENT_RANK,
  InscribedOrderHeaderReader,
} from "../../../production/channels/packing/index.js";
import {
  PackingWithdrawalDesk,
  type PackingWithdrawalOutcome,
} from "../../channels/commerce/index.js";
import type { ContainerLine } from "../../domain/entities/order-contents.js";
import type { PackingSheet } from "../../domain/entities/packing-sheet.js";
import {
  PackingSheetWithdrawnEvent,
  type ReleasedLine,
} from "../../domain/events/packing-sheet-withdrawn.events.js";
import { InscribedOrderNotOnDayError } from "../../domain/errors/packing-withdrawal-errors.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { PackingSheetTombstones } from "../../domain/ports/packing-sheet-tombstones.js";
import { PackingContainerVoiding } from "../containers/packing-container-voiding.js";

/**
 * L'implémentation du guichet du retrait au colisage — cf.
 * {@link PackingWithdrawalDesk} (plan A1, § 2.2).
 *
 * 1. La feuille, sous verrou. Absente : la pierre tombale est posée avec
 *    l'en-tête que le fournil a figé, puis relue sous verrou — si le tirage
 *    est passé entre-temps, c'est sa feuille qu'on relit.
 * 2. Fermée → `packed` ; un bac de livraison vivant → `delivery_bin`. Rien
 *    n'est écrit.
 * 3. Chaque contenant vivant est annulé par le geste du poste
 *    ({@link PackingContainerVoiding}) : bac, contenant, réserve triée par SKU.
 * 4. La feuille est marquée retirée, puis sauvée.
 * 5. Le fait `packing.sheet_withdrawn` part, durable et journalisé (lot
 *    A1.3), avec ce qui est revenu à la réserve — seulement quand ce retrait
 *    a écrit : un second retrait ne publie rien.
 *
 * Tourne dans l'unité de travail de l'appelant : elle la REJOINT.
 */
@Injectable()
export class PackingSheetWithdrawalDesk extends PackingWithdrawalDesk {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly tombstones: PackingSheetTombstones,
    private readonly headers: InscribedOrderHeaderReader,
    private readonly voiding: PackingContainerVoiding,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
    private readonly durable: DurablePublisher,
  ) {
    super();
  }

  async withdraw(
    serviceDay: string,
    orderId: string,
    withdrawnBy: string,
  ): Promise<PackingWithdrawalOutcome> {
    return this.uow.run(async () => {
      const at = this.clock.now();
      const { sheet, laid } = await this.lockedOrLaid(serviceDay, orderId, at);
      if (sheet.withdrawnAt !== null) {
        // La pierre tombale que CE retrait vient de poser : le fait part, sans
        // ligne rendue. Une feuille déjà retirée avant lui : rien de plus.
        if (laid) {
          await this.announce(sheet, at, []);
        }
        return "withdrawn";
      }
      if (sheet.packed !== null) {
        return "packed";
      }
      if (sheet.liveBinIds.length > 0) {
        return "delivery_bin";
      }
      const live = sheet.containerList
        .filter((container) => container.voided === null)
        .map((container) => container.id);
      const released = await this.voiding.voidAll(sheet, live, { at, by: withdrawnBy });
      sheet.withdrawSheet(at);
      await this.sheets.save(sheet);
      await this.announce(sheet, at, namedLines(sheet, released));
      return "withdrawn";
    });
  }

  /** `packing.sheet_withdrawn`, durable et journalisé (lot A1.3). */
  private async announce(
    sheet: PackingSheet,
    at: Date,
    released: readonly ReleasedLine[],
  ): Promise<void> {
    const event = new PackingSheetWithdrawnEvent(
      sheet.serviceDay,
      sheet.orderId,
      sheet.rank,
      sheet.reference,
      at,
      released,
    );
    await this.events.publishTraced(event);
    await this.durable.publish(event.durableFact());
  }

  /**
   * La feuille sous verrou — ou la pierre tombale, posée puis relue sous
   * verrou (`laid`). Si le tirage est passé entre-temps, c'est sa feuille.
   * Celle de rang 1 : aucun reliquat n'est encore inscrit au colisage (L8), et
   * retirer TOUS les envois d'une commande annulée est un verrou de L5.
   */
  private async lockedOrLaid(
    serviceDay: string,
    orderId: string,
    at: Date,
  ): Promise<{ readonly sheet: PackingSheet; readonly laid: boolean }> {
    const existing = await this.sheets.lock(serviceDay, orderId, FIRST_SHIPMENT_RANK);
    if (existing !== null) {
      return { sheet: existing, laid: false };
    }
    const header = await this.headers.headerOf(serviceDay, orderId);
    if (header === null) {
      throw new InscribedOrderNotOnDayError(orderId, serviceDay);
    }
    await this.tombstones.lay({ serviceDay, orderId, ...header, withdrawnAt: at });
    const laid = await this.sheets.lock(serviceDay, orderId, FIRST_SHIPMENT_RANK);
    if (laid === null) {
      throw new InscribedOrderNotOnDayError(orderId, serviceDay);
    }
    return { sheet: laid, laid: true };
  }
}

/** Les lignes rendues, nommées comme la feuille les nomme — le SKU à défaut. */
function namedLines(sheet: PackingSheet, released: readonly ContainerLine[]): ReleasedLine[] {
  const names = new Map(sheet.lines.map((line) => [line.sku, line.productName]));
  return released.map((line) => ({
    sku: line.sku,
    productName: names.get(line.sku) ?? line.sku,
    quantity: line.quantity,
  }));
}
