import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { FIRST_SHIPMENT_RANK } from "../../../production/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  DaySupervisionReader,
  type SupervisedOrder,
  type SupervisedShortfallLine,
} from "../domain/ports/day-supervision.reader.js";
import { shortfallLinesOf } from "./prisma-order-shortfall.repository.js";
import { fulfillmentOf, windowOf } from "./order-fulfillment.parse.js";
import { settlementWhere } from "./plan-filter.js";

/**
 * Ce que la Supervision lit d'une commande : ni ligne, ni montant, ni contact.
 * Le manque est celui du RANG 1 (plan E7 reliquat, LB) : la journée supervisée
 * est celle de la commande ; un reste se supervise à son jour (L7, L8).
 */
const SUPERVISION_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillmentMethod: true,
  fulfillment: true,
  shortfalls: {
    where: { rank: FIRST_SHIPMENT_RANK },
    select: { reportedAt: true, lines: true, decidedAt: true },
  },
  company: { select: { raisonSociale: true } },
  placedBy: { select: { firstName: true, lastName: true } },
} as const;

/**
 * La Supervision du jour, lue sur les seules tables du commerce
 * (`documentation/supervision/architecture-supervision-du-jour.md`).
 *
 * 🔴 **Le filtre d'argent est celui du dossier du jour** — `settlementWhere`, pas
 * `planWhere` : on garde les commandes prêtes et retirées, qui sont justement
 * ce qu'on supervise, et on écarte les règlements morts et toute carte restée
 * en l'air — pro compris depuis D2 (2026-09-22).
 */
@Injectable()
export class PrismaDaySupervisionReader extends DaySupervisionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ordersOn(day: string): Promise<readonly SupervisedOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        // La colonne est un `date` Postgres, lu par Prisma à minuit UTC : la
        // borne se compose de la même façon que dans `PrismaDayOrdersSource`.
        requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
        status: { not: "draft" },
        ...settlementWhere(),
      },
      orderBy: { orderNumber: "asc" },
      select: SUPERVISION_SELECT,
    });
    const pendingOf = new Map(rows.map((row) => [row.id, pendingShortfallOf(row.shortfalls)]));
    const names = await this.productNames(
      rows.filter((row) => pendingOf.get(row.id) !== null).map((row) => row.id),
    );
    return rows.map((row) => {
      const pending = pendingOf.get(row.id) ?? null;
      return {
        orderId: row.id,
        reference: row.orderNumber,
        customerName: nameOf(row.company, row.placedBy),
        fulfillmentMethod: row.fulfillmentMethod,
        status: row.status,
        window: windowOf(fulfillmentOf(row.fulfillment)),
        shortfallReportedAt: pending?.reportedAt ?? null,
        shortfallLines:
          pending === null ? [] : namedLines(shortfallLinesOf(pending.lines), names.get(row.id)),
      };
    });
  }

  /**
   * Le nom à la commande de chaque article, pour les seules commandes au manque
   * en vigueur — une requête de plus, jamais les lignes de toute la journée.
   */
  private async productNames(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, ReadonlyMap<string, string>>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const lines = await this.prisma.orderLine.findMany({
      where: { orderId: { in: [...orderIds] } },
      select: { orderId: true, sku: true, productNameSnapshot: true },
    });
    const byOrder = new Map<string, Map<string, string>>();
    for (const line of lines) {
      const names = byOrder.get(line.orderId) ?? new Map<string, string>();
      names.set(line.sku, line.productNameSnapshot);
      byOrder.set(line.orderId, names);
    }
    return byOrder;
  }

  countUndated(): Promise<number> {
    // Les commandes OUVERTES seulement : une commande retirée ou annulée sans
    // date ne demande plus aucun geste, et la compter ferait un signal que
    // l'historique ne laisserait jamais redescendre (décidé le 2026-09-25).
    return this.prisma.order.count({
      where: {
        requestedDeliveryDate: null,
        status: { notIn: ["draft", "fulfilled", "cancelled"] },
        ...settlementWhere(),
      },
    });
  }
}

/**
 * Le NOM du client : la société si elle en a un, sinon la personne. 🔴 Jamais
 * l'e-mail en repli — contrairement à la file du comptoir : la Supervision
 * s'ouvre à qui n'a pas `b2b_orders`, et le plan n'y met que des noms.
 */
function nameOf(
  company: { readonly raisonSociale: string } | null,
  person: { readonly firstName: string; readonly lastName: string },
): string | null {
  if (company !== null && company.raisonSociale.trim() !== "") {
    return company.raisonSociale;
  }
  const fullName = `${person.firstName} ${person.lastName}`.trim();
  return fullName === "" ? null : fullName;
}

/** Le manque en vigueur : signalé, non décidé (E6b) — `null` sinon. */
function pendingShortfallOf(
  shortfalls: readonly {
    readonly reportedAt: Date | null;
    readonly lines: Prisma.JsonValue;
    readonly decidedAt: Date | null;
  }[],
): { readonly reportedAt: Date; readonly lines: Prisma.JsonValue } | null {
  const shortfall = shortfalls[0];
  if (
    shortfall === undefined ||
    shortfall.decidedAt !== null ||
    shortfall.reportedAt === null ||
    shortfall.lines === null
  ) {
    return null;
  }
  return { reportedAt: shortfall.reportedAt, lines: shortfall.lines };
}

/** Le manque nommé ; un article absent des lignes garde son SKU plutôt qu'un nom inventé. */
function namedLines(
  lines: readonly { readonly sku: string; readonly due: number; readonly packed: number }[],
  names: ReadonlyMap<string, string> | undefined,
): SupervisedShortfallLine[] {
  return lines.map((line) => ({
    sku: line.sku,
    productName: names?.get(line.sku) ?? line.sku,
    due: line.due,
    packed: line.packed,
  }));
}
