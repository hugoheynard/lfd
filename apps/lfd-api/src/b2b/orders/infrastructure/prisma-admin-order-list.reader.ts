import { companyDisplayName, type AdminOrderRow } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  AdminOrderListReader,
  type AdminOrderListCriteria,
  type AdminOrderListSlice,
} from "../domain/ports/admin-order-list.reader.js";
import { orderOriginOf } from "../domain/services/order-origin.js";
import { customerLabelOf } from "./handover-order.query.js";

const ADMIN_ROW_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  fulfillmentMethod: true,
  requestedDeliveryDate: true,
  clientele: true,
  subtotalCents: true,
  vatCents: true,
  totalCents: true,
  companyId: true,
  fromSubscriptionId: true,
  placedByStaffId: true,
  createdAt: true,
  company: { select: { raisonSociale: true, enseigne: true } },
  placedBy: { select: { email: true, firstName: true, lastName: true } },
} satisfies Prisma.OrderSelect;

type AdminRow = Prisma.OrderGetPayload<{ select: typeof ADMIN_ROW_SELECT }>;

/**
 * La liste staff, par **pagination par clé** (`createdAt desc, id desc`) : une
 * page lit `limit + 1` lignes strictement après le curseur, et la ligne en trop
 * ne sert qu'à dire qu'il en reste. Pas d'`OFFSET` — une commande passée entre
 * deux pages décalerait tout.
 *
 * Une seule requête, avec les deux jointures qui nomment le client : la société
 * si elle existe, la personne sinon (`placedBy`, le `User` du commerce — même
 * contexte, aucune frontière franchie). La recherche passe par ces MÊMES
 * jointures : un particulier se trouve par son prénom ou son nom, jamais par
 * une table d'un autre bloc.
 */
@Injectable()
export class PrismaAdminOrderListReader extends AdminOrderListReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(criteria: AdminOrderListCriteria): Promise<AdminOrderListSlice> {
    const rows = await this.prisma.order.findMany({
      where: { AND: whereOf(criteria) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: criteria.limit + 1,
      select: ADMIN_ROW_SELECT,
    });
    return {
      rows: rows.slice(0, criteria.limit).map(toAdminRow),
      hasMore: rows.length > criteria.limit,
    };
  }
}

/** Chaque filtre posé est une clause ; aucune ne s'écrase l'une l'autre. */
function whereOf(criteria: AdminOrderListCriteria): Prisma.OrderWhereInput[] {
  const clauses: Prisma.OrderWhereInput[] = [
    companyWhere(criteria),
    ...criteria.searchTerms.map(searchWhere),
  ];
  if (criteria.status !== null) clauses.push({ status: criteria.status });
  if (criteria.paymentStatus !== null) clauses.push({ paymentStatus: criteria.paymentStatus });
  // `clientele` nul = commande d'avant la distinction : l'égalité l'écarte des
  // DEUX valeurs, et c'est voulu — on ne la devine pas après coup.
  if (criteria.clientele !== null) clauses.push({ clientele: criteria.clientele });
  if (criteria.method !== null) clauses.push({ fulfillmentMethod: criteria.method });
  if (criteria.placedFrom !== null) clauses.push({ createdAt: { gte: criteria.placedFrom } });
  if (criteria.placedBefore !== null) clauses.push({ createdAt: { lt: criteria.placedBefore } });
  if (criteria.fulfillmentFrom !== null) {
    clauses.push({ requestedDeliveryDate: { gte: dateColumnOf(criteria.fulfillmentFrom) } });
  }
  if (criteria.fulfillmentTo !== null) {
    clauses.push({ requestedDeliveryDate: { lte: dateColumnOf(criteria.fulfillmentTo) } });
  }
  if (criteria.after !== null) {
    const { placedAt, orderId } = criteria.after;
    clauses.push({
      OR: [{ createdAt: { lt: placedAt } }, { createdAt: placedAt, id: { lt: orderId } }],
    });
  }
  return clauses;
}

/**
 * Le filtre société. Avec `withSubAccounts`, la société ET ses sous-comptes
 * actuels — la structure d'aujourd'hui, pas le payeur à date : l'onglet suit
 * l'activité d'un groupe, il ne compte pas d'argent.
 */
function companyWhere(criteria: AdminOrderListCriteria): Prisma.OrderWhereInput {
  if (criteria.companyId === null) {
    return {};
  }
  if (!criteria.withSubAccounts) {
    return { companyId: criteria.companyId };
  }
  return {
    OR: [{ companyId: criteria.companyId }, { company: { parentCompanyId: criteria.companyId } }],
  };
}

/** Un mot : dans la référence, la raison sociale, l'enseigne, le prénom ou le nom. */
function searchWhere(term: string): Prisma.OrderWhereInput {
  const contains = { contains: term, mode: "insensitive" } as const;
  return {
    OR: [
      { orderNumber: contains },
      { company: { raisonSociale: contains } },
      { company: { enseigne: contains } },
      { placedBy: { firstName: contains } },
      { placedBy: { lastName: contains } },
    ],
  };
}

/**
 * Un jour → la valeur d'une colonne `@db.Date`. Ce n'est PAS un instant : la
 * colonne est un jour sans fuseau, que Prisma transporte à minuit UTC, et elle
 * n'est comparée qu'à d'autres jours (`lint:business-day` le distingue).
 */
function dateColumnOf(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function toAdminRow(row: AdminRow): AdminOrderRow {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    placedAt: row.createdAt.toISOString(),
    status: row.status,
    paymentStatus: row.paymentStatus,
    fulfillmentMethod: row.fulfillmentMethod,
    fulfillmentDay:
      row.requestedDeliveryDate === null
        ? null
        : row.requestedDeliveryDate.toISOString().slice(0, 10),
    clientele: row.clientele,
    subtotalCents: row.subtotalCents,
    vatCents: row.vatCents,
    totalCents: row.totalCents,
    customerLabel: customerLabelOf(row),
    companyId: row.companyId,
    companyDisplayName: row.company === null ? null : companyDisplayName(row.company),
    origin: orderOriginOf(row),
  };
}
