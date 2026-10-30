import { Injectable } from "@nestjs/common";
import {
  companyDisplayName,
  type ArticleReservationView,
  type CompanyReservedArticlesView,
  type MadeToOrderMarkView,
  type ReservedArticleView,
} from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { MadeToOrderAdminReader } from "../domain/ports/made-to-order-admin.reader.js";
import { reservedVisibilityOf } from "./reserved-visibility-column.js";
import { STILL_SOLD } from "./sellable-filter.js";

/** Le réglage lu sur la ligne de décision ; absente = les défauts de la base. */
const SETTING = { select: { isMadeToOrder: true, reservedVisibility: true } } as const;

/** Le seul statut d'un principal qui ouvre ses sites (Q8, comme `inheritedSiteWhere`). */
const ACTIVE = "active";

type Setting = { readonly isMadeToOrder: boolean; readonly reservedVisibility: string } | null;

function settingOf(override: Setting) {
  return {
    isMadeToOrder: override?.isMadeToOrder ?? false,
    reservedVisibility: reservedVisibilityOf(override?.reservedVisibility),
  };
}

/**
 * Le réglage sur mesure, pour le back-office. Les articles retirés n'y sont
 * pas (`STILL_SOLD`), comme partout au paramétrage : leur réservation reste
 * en base, et reparaît s'ils reviennent.
 */
@Injectable()
export class PrismaMadeToOrderAdminReader extends MadeToOrderAdminReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {
    super();
  }

  async marks(): Promise<MadeToOrderMarkView[]> {
    const rows = await this.prisma.catalogItem.findMany({
      where: {
        ...STILL_SOLD,
        OR: [{ override: { isMadeToOrder: true } }, { reservations: { some: {} } }],
      },
      select: { sku: true, override: SETTING, _count: { select: { reservations: true } } },
      orderBy: { sku: "asc" },
    });
    return rows.map((row) => ({
      sku: row.sku,
      ...settingOf(row.override),
      reservationCount: row._count.reservations,
    }));
  }

  async ofArticle(sku: string): Promise<ArticleReservationView | null> {
    const row = await this.prisma.catalogItem.findUnique({
      where: { sku, ...STILL_SOLD },
      select: {
        sku: true,
        name: true,
        override: SETTING,
        reservations: { orderBy: [{ reservedAt: "asc" }, { companyId: "asc" }] },
      },
    });
    if (row === null) {
      return null;
    }
    const [names, authors] = await Promise.all([
      this.companyNames(row.reservations.map((reservation) => reservation.companyId)),
      this.staffAuthors.identify(row.reservations.map((reservation) => reservation.reservedBy)),
    ]);
    return {
      sku: row.sku,
      name: row.name,
      ...settingOf(row.override),
      holders: row.reservations.map((reservation) => ({
        companyId: reservation.companyId,
        companyName: names.get(reservation.companyId) ?? null,
        reservedAt: reservation.reservedAt.toISOString(),
        reservedByName: authors.nameOf(reservation.reservedBy),
      })),
    };
  }

  async ofCompany(companyId: string): Promise<CompanyReservedArticlesView | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        parentCompany: {
          select: { id: true, status: true, enseigne: true, raisonSociale: true },
        },
      },
    });
    if (company === null) {
      return null;
    }
    const parent = company.parentCompany;
    const holders = parent === null ? [companyId] : [companyId, parent.id];
    const articles = await this.reservedTo(holders);
    return {
      own: articles.get(companyId) ?? [],
      principal:
        parent === null
          ? null
          : {
              companyId: parent.id,
              name: companyDisplayName(parent),
              active: parent.status === ACTIVE,
              articles: articles.get(parent.id) ?? [],
            },
    };
  }

  /** Les articles en vente réservés à ces sociétés, rangés par société, triés par nom. */
  private async reservedTo(
    companyIds: readonly string[],
  ): Promise<ReadonlyMap<string, ReservedArticleView[]>> {
    const rows = await this.prisma.catalogItemReservation.findMany({
      where: { companyId: { in: [...companyIds] }, item: { ...STILL_SOLD } },
      select: {
        companyId: true,
        reservedAt: true,
        reservedBy: true,
        item: { select: { sku: true, name: true, override: SETTING } },
      },
      orderBy: [{ item: { name: "asc" } }, { sku: "asc" }],
    });
    const authors = await this.staffAuthors.identify(rows.map((row) => row.reservedBy));
    const byCompany = new Map<string, ReservedArticleView[]>();
    for (const row of rows) {
      const list = byCompany.get(row.companyId) ?? [];
      list.push({
        sku: row.item.sku,
        name: row.item.name,
        ...settingOf(row.item.override),
        reservedAt: row.reservedAt.toISOString(),
        reservedByName: authors.nameOf(row.reservedBy),
      });
      byCompany.set(row.companyId, list);
    }
    return byCompany;
  }

  private async companyNames(companyIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (companyIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.company.findMany({
      where: { id: { in: [...companyIds] } },
      select: { id: true, enseigne: true, raisonSociale: true },
    });
    return new Map(rows.map((row) => [row.id, companyDisplayName(row)]));
  }
}
