import type { ReachableSiteView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { openingMembership } from "../../shared/company-standing/infrastructure/opening-membership.js";
import { readReachableSites } from "../../shared/company-standing/infrastructure/read-company-standing.js";
import {
  AccountReader,
  type AccountView,
  type CompanyView,
} from "../domain/ports/account.reader.js";
import { parseNavPreferences } from "../domain/value-objects/nav-preferences.js";
import { COMPANY_VIEW_SELECT, toCompanyView } from "./company-view.mapper.js";

/**
 * Lecture du compte en **une** requête : la personne, ses rattachements, et la
 * société de chacun.
 *
 * Les onglets de « Mes entreprises » sont ordonnés par ancienneté du
 * rattachement — un ordre stable, donc des onglets qui ne sautent pas d'un
 * chargement à l'autre. Un tri sur la raison sociale ferait bouger le premier
 * onglet à chaque société ajoutée.
 */
@Injectable()
export class PrismaAccountReader extends AccountReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async read(userId: string): Promise<AccountView | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        navPrefs: true,
        memberships: {
          // Seules les sociétés que le rattachement OUVRE : une invitation
          // expirée ne liste pas sa société (§8.1 bis, 2026-10-10).
          where: openingMembership(this.clock.now()),
          orderBy: { createdAt: "asc" },
          select: { role: true, company: { select: COMPANY_VIEW_SELECT } },
        },
      },
    });
    if (row === null) {
      return null;
    }

    const companies: CompanyView[] = row.memberships.map(({ role, company }) =>
      toCompanyView(role, company),
    );
    const reachableSites = await this.readReachableSites(userId);
    return {
      reachableSites,
      profile: {
        userId: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
      },
      companies,
      navPrefs: parseNavPreferences(row.navPrefs),
    };
  }

  /**
   * Les sites atteints par héritage seul, chacun en `CompanyView` COMPLÈTE
   * au rôle effectif (S6, plan §6) : la requête partagée dit lesquels et à
   * quel rôle, UNE lecture par lot rend leurs fiches — pas une par site.
   * L'ordre est celui de la requête partagée (principal, puis nom).
   */
  private async readReachableSites(userId: string): Promise<ReachableSiteView[]> {
    const reachable = await readReachableSites(this.prisma, this.clock.now(), userId);
    if (reachable.length === 0) {
      return [];
    }
    const rows = await this.prisma.company.findMany({
      where: { id: { in: reachable.map((site) => site.companyId) } },
      select: COMPANY_VIEW_SELECT,
    });
    const byId = new Map(rows.map((company) => [company.id, company]));
    return reachable.flatMap(({ companyId, via, role, readsBilling }) => {
      const company = byId.get(companyId);
      // Absente entre les deux lectures : pas de société inventée.
      return company === undefined
        ? []
        : [
            {
              company: toCompanyView(role, company),
              via: { companyId: via.companyId, name: via.name },
              canReadBilling: readsBilling,
            },
          ];
    });
  }
}
