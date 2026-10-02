import type { StopDecisionOutcome } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type BroughtBackOrderRow,
  BroughtBackOrdersReader,
} from "../domain/ports/brought-back-orders.reader.js";

const BRING_BACK: StopDecisionOutcome = "bring_back";

/**
 * **Adaptateur Prisma des commandes rapportées** (lot RL1). Il ne lit que les
 * tables de la livraison : la décision et les arrêts. Le commerce (annulée,
 * retirée au comptoir) est relu par l'appelant, par son canal.
 *
 * « Replacée » : un arrêt NON RETIRÉ de la commande créé APRÈS la décision —
 * vivant, ou déjà clos (remis, rapporté de nouveau). Un arrêt retiré à la
 * main la rend de nouveau à placer.
 */
@Injectable()
export class PrismaBroughtBackOrdersReader extends BroughtBackOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async awaitingPlacement(): Promise<readonly BroughtBackOrderRow[]> {
    const latest = await this.latestOf(undefined);
    if (latest.size === 0) {
      return [];
    }
    const stops = await this.prisma.deliveryRoundStop.findMany({
      where: { orderId: { in: [...latest.keys()] }, removedAt: null },
      select: { orderId: true, createdAt: true },
    });
    const replaced = new Set(
      stops
        .filter((stop) => stop.createdAt > (latest.get(stop.orderId) ?? stop.createdAt))
        .map((stop) => stop.orderId),
    );
    return [...latest]
      .filter(([orderId]) => !replaced.has(orderId))
      .map(([orderId, broughtBackAt]) => ({ orderId, broughtBackAt }))
      .sort((a, b) => a.broughtBackAt.getTime() - b.broughtBackAt.getTime());
  }

  async lastAmong(orderIds: readonly string[]): Promise<ReadonlyMap<string, Date>> {
    return orderIds.length === 0 ? new Map() : this.latestOf(orderIds);
  }

  /** La dernière décision « Rapporter » de chaque commande (de celles-ci, ou de toutes). */
  private async latestOf(orderIds: readonly string[] | undefined): Promise<Map<string, Date>> {
    const rows = await this.prisma.deliveryStopDecision.findMany({
      where: {
        outcome: BRING_BACK,
        decidedAt: { not: null },
        ...(orderIds === undefined ? {} : { orderId: { in: [...orderIds] } }),
      },
      select: { orderId: true, decidedAt: true },
    });
    const latest = new Map<string, Date>();
    for (const row of rows) {
      const known = latest.get(row.orderId);
      if (row.decidedAt !== null && (known === undefined || row.decidedAt > known)) {
        latest.set(row.orderId, row.decidedAt);
      }
    }
    return latest;
  }
}
