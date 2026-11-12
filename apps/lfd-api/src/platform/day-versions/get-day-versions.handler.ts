import { type DayVersionsView, hasStaffPermission } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { GetDayVersionsQuery } from "./get-day-versions.query.js";
import { ScopeVersions } from "./scope-versions.js";
import { VersionRegistry } from "./version-registry.js";

/**
 * **Les journées ont-elles bougé ?** — l'ancienne porte `admin/day-versions`,
 * servie un déploiement de plus pour les onglets restés sur l'ancien bundle
 * (`le-cache-du-back-office.md`, § 2.3), puis retirée.
 *
 * Elle lit les mêmes cartes que `admin/versions` ({@link ScopeVersions}), puis
 * tranche le droit PAR JOURNAL : un journal non permis est omis de SA
 * réponse, sans refuser les autres.
 */
@QueryHandler(GetDayVersionsQuery)
export class GetDayVersionsHandler implements IQueryHandler<GetDayVersionsQuery, DayVersionsView> {
  constructor(
    private readonly registry: VersionRegistry,
    private readonly scopes: ScopeVersions,
  ) {}

  async execute(query: GetDayVersionsQuery): Promise<DayVersionsView> {
    const versions = await this.scopes.of(query.serviceDay);
    const permitted = query.journals.filter((journal) =>
      this.registry
        .readersOf(journal)
        .some((permission) => hasStaffPermission(query.permissions, permission)),
    );
    return {
      date: query.serviceDay,
      versions: Object.fromEntries(
        permitted.flatMap((journal) => {
          const version = versions[journal];
          return version === undefined ? [] : [[journal, version]];
        }),
      ),
    };
  }
}
