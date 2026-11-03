import { type DayJournal, type DayVersionsView, hasStaffPermission } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DayVersionRegistry } from "./day-version-registry.js";
import { GetDayVersionsQuery } from "./get-day-versions.query.js";

/**
 * **Les journées ont-elles bougé ?** — la question qu'un onglet pose toutes
 * les 15 s, une fois pour tous ses écrans (`plan-version-par-journee.md`, D8).
 *
 * Le droit se tranche PAR JOURNAL : un journal que l'appelant ne peut pas lire
 * est omis, sans refuser les autres — un poste de retrait seul suit le
 * commerce et le fournil, pas la livraison. Les journaux permis se lisent en
 * parallèle ; un échec de l'un fait échouer la réponse entière, que le
 * veilleur traite comme « rien relu ».
 */
@QueryHandler(GetDayVersionsQuery)
export class GetDayVersionsHandler implements IQueryHandler<GetDayVersionsQuery, DayVersionsView> {
  constructor(private readonly registry: DayVersionRegistry) {}

  async execute(query: GetDayVersionsQuery): Promise<DayVersionsView> {
    const permitted = query.journals
      .map((journal) => this.registry.sourceOf(journal))
      .filter((source) =>
        source.readers.some((permission) => hasStaffPermission(query.permissions, permission)),
      );
    const read = await Promise.all(
      permitted.map(async (source): Promise<readonly [DayJournal, number]> => [
        source.journal,
        await source.versionOf(query.serviceDay),
      ]),
    );
    return { date: query.serviceDay, versions: Object.fromEntries(read) };
  }
}
