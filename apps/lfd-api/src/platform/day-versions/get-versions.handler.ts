import {
  hasStaffPermission,
  isDayJournal,
  type VersionSubject,
  type VersionsView,
} from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DomainError } from "../shared/errors/app-error.js";
import { GLOBAL_SCOPE } from "./day-versions-cache.js";
import { GetVersionsQuery } from "./get-versions.query.js";
import { type ScopeVersionsMap, ScopeVersions } from "./scope-versions.js";
import { VersionRegistry } from "./version-registry.js";

/** Un sujet journalier demandé sans journée. */
export class VersionsDayMissingError extends DomainError {
  constructor() {
    super(
      "versions.day_missing",
      "Un sujet journalier est demandé sans journée : ajouter `date=AAAA-MM-JJ` à la question.",
    );
  }
}

/**
 * **Les sujets ont-ils bougé ?** — la question qu'un onglet pose toutes les
 * 15 s, une fois pour tous ses écrans (`plan-veilleur-unique.md`, § 3.3).
 *
 * Le droit se tranche D'ABORD, sujet par sujet : un sujet que l'appelant ne
 * peut pas lire est absent de sa réponse, sans refuser les autres. Puis une
 * carte par portée effectivement demandée — la journée, les sujets globaux,
 * ou les deux — lue par {@link ScopeVersions}, complète et sans filtre.
 */
@QueryHandler(GetVersionsQuery)
export class GetVersionsHandler implements IQueryHandler<GetVersionsQuery, VersionsView> {
  constructor(
    private readonly registry: VersionRegistry,
    private readonly scopes: ScopeVersions,
  ) {}

  async execute(query: GetVersionsQuery): Promise<VersionsView> {
    const permitted = query.subjects.filter((subject) =>
      this.registry
        .readersOf(subject)
        .some((permission) => hasStaffPermission(query.permissions, permission)),
    );
    const nothing: ScopeVersionsMap = {};
    const [daily, global] = await Promise.all([
      this.dayVersions(query.serviceDay, permitted),
      permitted.some((subject) => !isDayJournal(subject))
        ? this.scopes.of(GLOBAL_SCOPE)
        : Promise.resolve(nothing),
    ]);
    return {
      date: query.serviceDay,
      versions: Object.fromEntries(
        permitted.flatMap((subject) => {
          const version = (isDayJournal(subject) ? daily : global)[subject];
          return version === undefined ? [] : [[subject, version]];
        }),
      ),
    };
  }

  private dayVersions(
    serviceDay: string | null,
    permitted: readonly VersionSubject[],
  ): Promise<ScopeVersionsMap> {
    if (!permitted.some(isDayJournal)) {
      return Promise.resolve({});
    }
    if (serviceDay === null) {
      throw new VersionsDayMissingError();
    }
    return this.scopes.of(serviceDay);
  }
}
