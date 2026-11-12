import { Injectable } from "@nestjs/common";

import { WallClock } from "../time/wall-clock.js";
import type { SubjectReading, VersionsCard } from "./day-versions-cache.js";
import { isFresh } from "./day-versions-card.js";
import { ResilientDayVersionsCache } from "./resilient-day-versions-cache.js";
import { type ScopedSubject, VersionRegistry } from "./version-registry.js";

/** Le numéro de chaque sujet d'une portée. */
export type ScopeVersionsMap = Readonly<Record<string, number>>;

/**
 * **Les numéros d'une portée** — une journée, ou les sujets globaux
 * (`le-cache-du-back-office.md`, § 2.3), sans regard au droit : c'est la porte
 * qui filtre ensuite.
 *
 * D'abord la carte de l'objet ; un sujet dont le numéro a été lu il y a moins
 * que SA fenêtre se sert tel quel. Les autres — périmés, ou absents d'une
 * carte rangée par une révision qui ne les connaissait pas — se relisent en
 * base, et SEULS eux partent au rangement : l'objet les fusionne à la carte
 * gardée. Un sujet à 30 s n'oblige donc pas à relire un sujet à 15 s.
 *
 * Une seule relecture à la fois par portée dans cette instance : les
 * questions qui arrivent pendant ce temps attendent son résultat. Un échec
 * d'une source fait échouer la réponse entière, que le veilleur traite comme
 * « rien relu ».
 */
@Injectable()
export class ScopeVersions {
  private readonly inFlight = new Map<string, Promise<ScopeVersionsMap>>();

  constructor(
    private readonly registry: VersionRegistry,
    private readonly cache: ResilientDayVersionsCache,
    private readonly wall: WallClock,
  ) {}

  /** La portée `scope` : une journée `AAAA-MM-JJ`, ou `GLOBAL_SCOPE`. */
  of(scope: string): Promise<ScopeVersionsMap> {
    const pending = this.inFlight.get(scope);
    if (pending !== undefined) {
      return pending;
    }
    const started = this.read(scope).finally(() => this.inFlight.delete(scope));
    this.inFlight.set(scope, started);
    return started;
  }

  private async read(scope: string): Promise<ScopeVersionsMap> {
    const subjects = this.registry.subjectsOf(scope);
    const kept = await this.cache.read(scope);
    const nowMs = this.wallMs();
    const fresh: Record<string, number> = {};
    const stale: ScopedSubject[] = [];
    for (const subject of subjects) {
      const reading = kept?.subjects[subject.subject];
      if (reading !== undefined && isFresh(reading, nowMs, subject.freshMs)) {
        fresh[subject.subject] = reading.version;
      } else {
        stale.push(subject);
      }
    }
    if (stale.length === 0) {
      return fresh;
    }
    return { ...fresh, ...(await this.readFromBase(scope, stale)) };
  }

  /** Les sujets périmés ; l'instant est pris AVANT la lecture, pas après. */
  private async readFromBase(
    scope: string,
    stale: readonly ScopedSubject[],
  ): Promise<ScopeVersionsMap> {
    const readAtMs = this.wallMs();
    const read = await Promise.all(
      stale.map(async (subject) => [subject.subject, await subject.versionOf(scope)] as const),
    );
    const card: VersionsCard = {
      subjects: Object.fromEntries(
        read.map(([subject, version]): [string, SubjectReading] => [
          subject,
          { version, readAtMs },
        ]),
      ),
    };
    this.cache.storeAfterReply(scope, card);
    return Object.fromEntries(read);
  }

  private wallMs(): number {
    return this.wall.elapsedNow().getTime();
  }
}
