import type { ReachableSiteView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { openingMembership } from "../../shared/company-standing/infrastructure/opening-membership.js";
import { readReachableSites } from "../../shared/company-standing/infrastructure/read-company-standing.js";
import {
  AccountReader,
  type CompanyView,
  type StoredAccountView,
} from "../domain/ports/account.reader.js";
import { parseNavPreferences } from "../domain/value-objects/nav-preferences.js";
import { COMPANY_VIEW_SELECT, toCompanyView } from "./company-view.mapper.js";

/**
 * Lecture du compte en **trois lectures indépendantes, lancées ensemble** : la
 * personne et ses préférences, ses rattachements ouvrants et leurs sociétés,
 * les sites qu'elle atteint par héritage.
 *
 * Une seule requête imbriquée (personne → rattachements → société) coûtait
 * autant d'allers-retours SUCCESSIFS que de niveaux — Prisma lit un niveau
 * après l'autre sans `relationJoins`, refusé le 2026-11-05
 * (`documentation/todos/todo-prisma-8-et-jointures.md`) — et les sites
 * attendaient la fin du tout. Découpées, le temps est celui de la plus longue.
 *
 * Une personne absente rend `null` : ses rattachements et ses sites, lus en
 * même temps, sont alors vides et jetés.
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

  async read(userId: string): Promise<StoredAccountView | null> {
    const now = this.clock.now();
    const [person, companies, reachableSites] = await Promise.all([
      this.readPerson(userId),
      this.readCompanies(userId, now),
      this.readReachableSites(userId, now),
    ]);
    if (person === null) {
      return null;
    }
    return {
      reachableSites,
      profile: {
        userId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        phone: person.phone,
      },
      companies,
      navPrefs: parseNavPreferences(person.navPreferences?.prefs ?? null),
    };
  }

  private readPerson(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        // Les préférences vivent hors de `users` depuis le 2026-11-04 (`qui-est-le-client.md`, « Les préférences de navigation hors de `users` »).
        navPreferences: { select: { prefs: true } },
      },
    });
  }

  /**
   * Seules les sociétés que le rattachement OUVRE : une invitation expirée ne
   * liste pas sa société (§8.1 bis, 2026-10-10). Ordre : ancienneté.
   */
  private async readCompanies(userId: string, now: Date): Promise<CompanyView[]> {
    const rows = await this.prisma.membership.findMany({
      where: { AND: [{ userId }, openingMembership(now)] },
      orderBy: { createdAt: "asc" },
      select: { role: true, company: { select: COMPANY_VIEW_SELECT } },
    });
    return rows.map(({ role, company }) => toCompanyView(role, company));
  }

  /**
   * Les sites atteints par héritage seul, chacun en `CompanyView` COMPLÈTE
   * au rôle effectif (S6, plan §6) : la requête partagée dit lesquels et à
   * quel rôle, UNE lecture par lot rend leurs fiches — pas une par site.
   * L'ordre est celui de la requête partagée (principal, puis nom).
   */
  private async readReachableSites(userId: string, now: Date): Promise<ReachableSiteView[]> {
    const reachable = await readReachableSites(this.prisma, now, userId);
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
