import {
  DAY_JOURNALS,
  GLOBAL_VERSION_SUBJECTS,
  type GlobalVersionSubject,
  isDayJournal,
  type StaffPermission,
  type VersionSubject,
} from "@lfd/contracts";

import { GLOBAL_SCOPE } from "./day-versions-cache.js";
import { DayVersionRegistry, DayVersionRegistryMisassembledError } from "./day-version-registry.js";
import type { GlobalVersionSource } from "./global-version-source.js";

/** Un sujet d'une portée, tel que la lecture des cartes le voit. */
export interface ScopedSubject {
  readonly subject: VersionSubject;
  readonly freshMs: number;
  /** Le numéro dans cette portée : la journée, ou {@link GLOBAL_SCOPE}. */
  versionOf(scope: string): Promise<number>;
}

/**
 * **Le registre des sujets** (`le-cache-du-back-office.md`, § 2.1) : les
 * journaux de journée (portée `day`, tenus par {@link DayVersionRegistry}) et
 * les sujets globaux (portée `global`).
 *
 * Il refuse de se construire si un sujet global du contrat
 * (`GLOBAL_VERSION_SUBJECTS`) n'a pas de source, ou en a deux — le registre
 * des journées tient la même règle pour les siens : l'API ne démarre pas
 * plutôt que de servir une porte qui tairait un sujet.
 */
export class VersionRegistry {
  private readonly globals: ReadonlyMap<GlobalVersionSubject, GlobalVersionSource>;

  constructor(
    private readonly days: DayVersionRegistry,
    globals: readonly GlobalVersionSource[],
  ) {
    const bySubject = new Map<GlobalVersionSubject, GlobalVersionSource>();
    for (const source of globals) {
      if (bySubject.has(source.subject)) {
        throw new DayVersionRegistryMisassembledError(
          `le sujet « ${source.subject} » a deux sources`,
        );
      }
      bySubject.set(source.subject, source);
    }
    const missing = GLOBAL_VERSION_SUBJECTS.filter((subject) => !bySubject.has(subject));
    if (missing.length > 0) {
      throw new DayVersionRegistryMisassembledError(
        `aucune source pour « ${missing.join(" », « ")} »`,
      );
    }
    this.globals = bySubject;
  }

  /** Les permissions dont l'une ouvre ce sujet. */
  readersOf(subject: VersionSubject): readonly [StaffPermission, ...StaffPermission[]] {
    return isDayJournal(subject)
      ? this.days.sourceOf(subject).readers
      : this.globalSource(subject).readers;
  }

  /** Tous les sujets d'une portée : ceux d'une journée, ou les globaux. */
  subjectsOf(scope: string): readonly ScopedSubject[] {
    if (scope === GLOBAL_SCOPE) {
      return GLOBAL_VERSION_SUBJECTS.map((subject) => {
        const source = this.globalSource(subject);
        return { subject, freshMs: source.freshMs, versionOf: () => source.versionOf() };
      });
    }
    return DAY_JOURNALS.map((journal) => {
      const source = this.days.sourceOf(journal);
      return {
        subject: journal,
        freshMs: source.freshMs,
        versionOf: (serviceDay: string) => source.versionOf(serviceDay),
      };
    });
  }

  private globalSource(subject: GlobalVersionSubject): GlobalVersionSource {
    const source = this.globals.get(subject);
    if (source === undefined) {
      throw new DayVersionRegistryMisassembledError(`aucune source pour « ${subject} »`);
    }
    return source;
  }
}
