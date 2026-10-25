import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { InscribedOrderHeaderReader } from "../../../production/channels/packing/index.js";
import {
  PackingWithdrawalDesk,
  type PackingWithdrawalOutcome,
} from "../../channels/commerce/index.js";
import type { PackingSheet } from "../../domain/entities/packing-sheet.js";
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
      const sheet = await this.lockedOrLaid(serviceDay, orderId, at);
      if (sheet.withdrawnAt !== null) {
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
      await this.voiding.voidAll(sheet, live, { at, by: withdrawnBy });
      sheet.withdrawSheet(at);
      await this.sheets.save(sheet);
      return "withdrawn";
    });
  }

  /** La feuille sous verrou — ou la pierre tombale, posée puis relue sous verrou. */
  private async lockedOrLaid(serviceDay: string, orderId: string, at: Date): Promise<PackingSheet> {
    const existing = await this.sheets.lock(serviceDay, orderId);
    if (existing !== null) {
      return existing;
    }
    const header = await this.headers.headerOf(serviceDay, orderId);
    if (header === null) {
      throw new InscribedOrderNotOnDayError(orderId, serviceDay);
    }
    await this.tombstones.lay({ serviceDay, orderId, ...header, withdrawnAt: at });
    const laid = await this.sheets.lock(serviceDay, orderId);
    if (laid === null) {
      throw new InscribedOrderNotOnDayError(orderId, serviceDay);
    }
    return laid;
  }
}
