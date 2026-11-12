import { DAY_JOURNALS, type DayVersionsView, hasStaffPermission } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { WallClock } from "../time/wall-clock.js";
import { type CompleteDayVersions, completeVersions, isFresh } from "./day-versions-card.js";
import { DayVersionRegistry, DayVersionRegistryMisassembledError } from "./day-version-registry.js";
import { GetDayVersionsQuery } from "./get-day-versions.query.js";
import { ResilientDayVersionsCache } from "./resilient-day-versions-cache.js";

/**
 * **Les journées ont-elles bougé ?** — la question qu'un onglet pose toutes
 * les 15 s, une fois pour tous ses écrans (`version-par-journee.md`, D8).
 *
 * D'abord la CARTE COMPLÈTE des numéros de la journée — tous les journaux du
 * registre, sans regard au droit : celle de l'objet des journées si elle a
 * été lue il y a moins de 5 s, sinon une relecture de toutes les sources en
 * base, rangée ensuite (`plan-objet-des-journees.md`, § 3 bis). PUIS le droit,
 * PAR JOURNAL : un journal que l'appelant ne peut pas lire est omis de SA
 * réponse, sans refuser les autres. Une carte filtrée rangée par un poste
 * limité laisserait un autre poste sans numéro.
 *
 * Une seule relecture à la fois par journée dans cette instance : les
 * questions qui arrivent pendant ce temps attendent son résultat. Un échec
 * d'une source fait échouer la réponse entière, que le veilleur traite comme
 * « rien relu ».
 */
@QueryHandler(GetDayVersionsQuery)
export class GetDayVersionsHandler implements IQueryHandler<GetDayVersionsQuery, DayVersionsView> {
  private readonly inFlight = new Map<string, Promise<CompleteDayVersions>>();

  constructor(
    private readonly registry: DayVersionRegistry,
    private readonly cache: ResilientDayVersionsCache,
    private readonly wall: WallClock,
  ) {}

  async execute(query: GetDayVersionsQuery): Promise<DayVersionsView> {
    const card = await this.cardOnce(query.serviceDay);
    const permitted = query.journals.filter((journal) =>
      this.registry
        .sourceOf(journal)
        .readers.some((permission) => hasStaffPermission(query.permissions, permission)),
    );
    return {
      date: query.serviceDay,
      versions: Object.fromEntries(permitted.map((journal) => [journal, card[journal]])),
    };
  }

  private cardOnce(serviceDay: string): Promise<CompleteDayVersions> {
    const pending = this.inFlight.get(serviceDay);
    if (pending !== undefined) {
      return pending;
    }
    const started = this.card(serviceDay).finally(() => this.inFlight.delete(serviceDay));
    this.inFlight.set(serviceDay, started);
    return started;
  }

  private async card(serviceDay: string): Promise<CompleteDayVersions> {
    const kept = await this.cache.read(serviceDay);
    const versions = kept === null ? null : completeVersions(kept);
    if (kept !== null && versions !== null && isFresh(kept, this.wallMs())) {
      return versions;
    }
    return this.readFromBase(serviceDay);
  }

  /** Toutes les sources ; l'instant est pris AVANT la lecture, pas après. */
  private async readFromBase(serviceDay: string): Promise<CompleteDayVersions> {
    const readAtMs = this.wallMs();
    const read = await Promise.all(
      DAY_JOURNALS.map(
        async (journal) =>
          [journal, await this.registry.sourceOf(journal).versionOf(serviceDay)] as const,
      ),
    );
    const versions = Object.fromEntries(read);
    this.cache.storeAfterReply(serviceDay, { versions, readAtMs });
    const complete = completeVersions({ versions, readAtMs });
    if (complete === null) {
      throw new DayVersionRegistryMisassembledError("une source n'a pas rendu de numéro");
    }
    return complete;
  }

  private wallMs(): number {
    return this.wall.elapsedNow().getTime();
  }
}
