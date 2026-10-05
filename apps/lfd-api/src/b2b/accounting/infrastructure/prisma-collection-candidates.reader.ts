import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CollectionCandidatesReader,
  type CollectableOrder,
} from "../domain/ports/collection-candidates.reader.js";
import type { BillingFollow } from "../domain/ports/statement-billing.reader.js";
import type { SepaScheme } from "../domain/value-objects/sepa-scheme.js";
import { billableOrderWhere } from "./billable-order-criterion.js";
import { toOrderCollectionState } from "./order-collection.mapper.js";

/** Les états qu'une constitution reprend : l'absence de ligne compte comme `due`. */
const OPEN_STATES = ["due", "excluded"] as const;

/**
 * Ce que lit la constitution d'un lot. Le critère de l'assiette est celui de
 * `billable-order-criterion.ts` — écrit une fois, partagé avec l'aperçu et le
 * relevé.
 *
 * `order_collection` n'a pas de relation Prisma vers `orders` (l'id est
 * opaque) : deux lectures, jointes en mémoire.
 */
@Injectable()
export class PrismaCollectionCandidatesReader extends CollectionCandidatesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async floor(): Promise<Date | null> {
    const row = await this.prisma.collectionFloor.findUnique({ where: { id: true } });
    return row?.floorAt ?? null;
  }

  async collectableOrders(floor: Date, closesAt: Date): Promise<readonly CollectableOrder[]> {
    const orders = await this.prisma.order.findMany({
      where: billableOrderWhere(floor, closesAt),
      orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
      select: { id: true, orderNumber: true, companyId: true, createdAt: true, totalCents: true },
    });
    const states = await this.prisma.orderCollection.findMany({
      where: { orderId: { in: orders.map((order) => order.id) } },
    });
    const stateOf = new Map(states.map((row) => [row.orderId, row]));
    return orders.flatMap((order) => {
      const state = stateOf.get(order.id);
      if (order.companyId === null || (state !== undefined && !isOpen(state.state))) {
        return [];
      }
      return [
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          companyId: order.companyId,
          placedAt: order.createdAt,
          totalCents: order.totalCents,
          collection: state === undefined ? null : toOrderCollectionState(state),
        },
      ];
    });
  }

  async billingFollowsOf(companyIds: readonly string[]): Promise<readonly BillingFollow[]> {
    const rows = await this.prisma.companyFollow.findMany({
      where: { companyId: { in: [...companyIds] }, aspect: "billing" },
      select: {
        companyId: true,
        parentId: true,
        validFrom: true,
        validTo: true,
        parent: { select: { raisonSociale: true } },
      },
    });
    return rows.map((row) => ({
      companyId: row.companyId,
      payerId: row.parentId,
      payerName: row.parent.raisonSociale,
      validFrom: row.validFrom,
      validTo: row.validTo,
    }));
  }

  async companyNames(companyIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const rows = await this.prisma.company.findMany({
      where: { id: { in: [...companyIds] } },
      select: { id: true, raisonSociale: true },
    });
    return new Map(rows.map((row) => [row.id, row.raisonSociale]));
  }

  async consumedMandates(mandateIds: readonly string[]): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.collectionBatchLine.findMany({
      where: { mandateId: { in: [...mandateIds] }, batch: { status: "deposited" } },
      select: { mandateId: true },
      distinct: ["mandateId"],
    });
    return new Set(rows.map((row) => row.mandateId));
  }

  async previousClosure(legalEntityId: string, before: Date): Promise<Date | null> {
    const row = await this.prisma.collectionBatch.findFirst({
      where: { legalEntityId, status: { not: "cancelled" }, cycleClosesAt: { lt: before } },
      orderBy: { cycleClosesAt: "desc" },
      select: { cycleClosesAt: true },
    });
    return row?.cycleClosesAt ?? null;
  }

  async liveSchemes(legalEntityId: string, closesAt: Date): Promise<readonly SepaScheme[]> {
    const rows = await this.prisma.collectionBatch.findMany({
      where: { legalEntityId, status: { not: "cancelled" }, cycleClosesAt: closesAt },
      select: { scheme: true },
    });
    return rows.map((row) => row.scheme);
  }
}

function isOpen(state: string): boolean {
  return OPEN_STATES.some((open) => open === state);
}
