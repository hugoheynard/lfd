import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  DaySupervisionReader,
  type SupervisedOrder,
} from "../domain/ports/day-supervision.reader.js";
import { fulfillmentOf, windowOf } from "./order-fulfillment.parse.js";
import { settlementWhere } from "./plan-filter.js";

/** Ce que la Supervision lit d'une commande : ni ligne, ni montant, ni contact. */
const SUPERVISION_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillmentMethod: true,
  fulfillment: true,
  company: { select: { raisonSociale: true } },
  placedBy: { select: { firstName: true, lastName: true } },
} as const;

/**
 * La Supervision du jour, lue sur les seules tables du commerce
 * (`documentation/order/plan-supervision-du-jour.md`).
 *
 * 🔴 **Le filtre d'argent est celui du dossier du jour** — `settlementWhere`, pas
 * `planWhere` : on garde les commandes prêtes et retirées, qui sont justement
 * ce qu'on supervise, et on écarte les règlements morts et le visiteur dont la
 * carte est restée en l'air.
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
        // borne se compose de la même façon que dans `PrismaDayOrdersReader`.
        requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
        status: { not: "draft" },
        ...settlementWhere(),
      },
      orderBy: { orderNumber: "asc" },
      select: SUPERVISION_SELECT,
    });
    return rows.map((row) => ({
      orderId: row.id,
      reference: row.orderNumber,
      customerName: nameOf(row.company, row.placedBy),
      fulfillmentMethod: row.fulfillmentMethod,
      status: row.status,
      window: windowOf(fulfillmentOf(row.fulfillment)),
    }));
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
