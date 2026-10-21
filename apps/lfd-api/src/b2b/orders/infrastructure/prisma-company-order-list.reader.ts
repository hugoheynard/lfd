import { companyDisplayName } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CompanyOrderListReader,
  type CompanyOrderEntry,
  type CompanyOrderListScope,
} from "../domain/ports/company-order-list.reader.js";
import { companyOrderWallOf } from "./company-order-wall.js";
import { CUSTOMER_VISIBLE, ORDER_SELECT, toOrderView } from "./prisma-order.reader.js";

const LIST_SELECT = {
  ...ORDER_SELECT,
  company: { select: { raisonSociale: true, enseigne: true } },
} as const;

type ListRow = Prisma.OrderGetPayload<{ select: typeof LIST_SELECT }>;

/**
 * « Mes commandes » d'une société et de ses sites, murée DANS le `where`
 * (`plan-commandes-des-sites.md`, §7.5) : la société elle-même, OU une
 * société dont elle est le parent ACTUEL et où le demandeur hérite — membre
 * `owner`/`admin` ACCEPTÉ de la société listée, celle-ci `active`. Le filtre
 * de site s'ajoute en `AND` : il ne peut que rétrécir le périmètre — comme
 * le filtre de jour de retrait/livraison, bornes incluses
 * (`plan-recapitulatif-des-commandes.md`, §6.6).
 */
@Injectable()
export class PrismaCompanyOrderListReader extends CompanyOrderListReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listFor(scope: CompanyOrderListScope): Promise<readonly CompanyOrderEntry[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        AND: [companyOrderWallOf(scope), siteFilterOf(scope), dayFilterOf(scope), CUSTOMER_VISIBLE],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: LIST_SELECT,
    });
    return rows.map((row) => entryOf(row, scope.companyId));
  }
}

function siteFilterOf(scope: CompanyOrderListScope): Prisma.OrderWhereInput {
  return scope.site === null ? {} : { companyId: scope.site };
}

/**
 * Les bornes du jour de retrait/livraison. Une borne posée exclut les
 * commandes sans date : `gte`/`lte` ne retiennent jamais un `NULL`.
 */
function dayFilterOf(scope: CompanyOrderListScope): Prisma.OrderWhereInput {
  if (scope.from === null && scope.to === null) {
    return {};
  }
  return {
    requestedDeliveryDate: {
      ...(scope.from === null ? {} : { gte: dateColumnOf(scope.from) }),
      ...(scope.to === null ? {} : { lte: dateColumnOf(scope.to) }),
    },
  };
}

/**
 * Un jour → la valeur d'une colonne `@db.Date` : un jour sans fuseau, que
 * Prisma transporte à minuit UTC, comparé à d'autres jours seulement.
 */
function dateColumnOf(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function entryOf(row: ListRow, listedCompanyId: string): CompanyOrderEntry {
  const site =
    row.companyId === null || row.companyId === listedCompanyId || row.company === null
      ? null
      : { companyId: row.companyId, name: companyDisplayName(row.company) };
  return { view: toOrderView(row), site, author: authorOf(row) };
}

/** Le nom de celui qui a passé la commande — l'équipe si elle l'a saisie (§7.6). */
function authorOf(row: ListRow): CompanyOrderEntry["author"] {
  if (row.placedByStaffId !== null) {
    return { kind: "team" };
  }
  const name = `${row.placedBy.firstName} ${row.placedBy.lastName}`.trim();
  return { kind: "customer", name: name === "" ? row.placedBy.email : name };
}
