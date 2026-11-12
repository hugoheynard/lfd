import type { DayJournal, GlobalVersionSubject, StaffPermission } from "@lfd/contracts";

import { ScriptedCallDeadline } from "../../cache-calls/__tests__/cache-call-doubles.js";
import { FixedStopwatch, RecordingTimings } from "../../metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../time/fixed-wall-clock.js";
import { DayVersionRegistry } from "../day-version-registry.js";
import { DayVersionSource } from "../day-version-source.js";
import { DayVersionsCache, type VersionsCard } from "../day-versions-cache.js";
import { GetDayVersionsHandler } from "../get-day-versions.handler.js";
import { GetVersionsHandler } from "../get-versions.handler.js";
import { GlobalVersionSource } from "../global-version-source.js";
import { ResilientDayVersionsCache } from "../resilient-day-versions-cache.js";
import { ScopeVersions } from "../scope-versions.js";
import { VersionRegistry } from "../version-registry.js";

/** Une source qui rend une version fixe et retient les journées demandées. */
export class RecordingSource extends DayVersionSource {
  readonly asked: string[] = [];
  private held: (() => void)[] | null = null;

  constructor(
    readonly journal: DayJournal,
    readonly readers: readonly [StaffPermission, ...StaffPermission[]],
    public version: number,
  ) {
    super();
  }

  /** Les lectures attendent {@link release} : une relecture en cours. */
  hold(): void {
    this.held = [];
  }

  release(): void {
    for (const resume of this.held?.splice(0) ?? []) {
      resume();
    }
    this.held = null;
  }

  versionOf(serviceDay: string): Promise<number> {
    this.asked.push(serviceDay);
    const held = this.held;
    if (held === null) {
      return Promise.resolve(this.version);
    }
    return new Promise<void>((resolve) => held.push(resolve)).then(() => this.version);
  }
}

/** Ce que fait l'objet : garder, échouer, ou ne jamais répondre. */
export type CacheBehaviour = "keeps" | "throws" | "hangs";

/**
 * L'objet des journées en mémoire : une carte par portée, fusionnée sujet par
 * sujet — un numéro ne remplace le gardé que s'il a été lu plus tard.
 */
export class InMemoryDayVersionsCache extends DayVersionsCache {
  readonly cards = new Map<string, VersionsCard>();
  behaviour: CacheBehaviour = "keeps";
  reads = 0;
  stores = 0;
  readonly stored: { readonly scope: string; readonly card: VersionsCard }[] = [];

  read(scope: string): Promise<VersionsCard | null> {
    this.reads += 1;
    return this.behave(() => this.cards.get(scope) ?? null);
  }

  store(scope: string, card: VersionsCard): Promise<void> {
    this.stores += 1;
    return this.behave(() => {
      this.stored.push({ scope, card });
      const subjects = { ...this.cards.get(scope)?.subjects };
      for (const [subject, reading] of Object.entries(card.subjects)) {
        const kept = subjects[subject];
        if (kept === undefined || reading.readAtMs > kept.readAtMs) {
          subjects[subject] = reading;
        }
      }
      this.cards.set(scope, { subjects });
    });
  }

  /** Le numéro gardé d'un sujet dans une portée. */
  versionOf(scope: string, subject: string): number | undefined {
    return this.cards.get(scope)?.subjects[subject]?.version;
  }

  private behave<T>(work: () => T): Promise<T> {
    switch (this.behaviour) {
      case "keeps":
        return Promise.resolve(work());
      case "throws":
        return Promise.reject(new TypeError("objet des journées injoignable"));
      case "hangs":
        return new Promise<T>(() => undefined);
    }
  }
}

export function sources(): Record<DayJournal, RecordingSource> {
  return {
    orders: new RecordingSource("orders", ["b2b_orders:read", "handover_counter:read"], 7),
    production: new RecordingSource("production", ["production_plan:read"], 42),
    delivery: new RecordingSource("delivery", ["delivery_rounds:read"], 3),
    "my-round": new RecordingSource("my-round", ["delivery_driving:read"], 11),
  };
}

/** Un sujet global qui rend un numéro fixe et compte ses lectures. */
export class RecordingGlobalSource extends GlobalVersionSource {
  asked = 0;

  constructor(
    readonly subject: GlobalVersionSubject,
    readonly readers: readonly [StaffPermission, ...StaffPermission[]],
    readonly freshMs: number,
    public version: number,
  ) {
    super();
  }

  versionOf(): Promise<number> {
    this.asked += 1;
    return Promise.resolve(this.version);
  }
}

export const COMPANIES_FRESH_MS = 30_000;
export const ALL_ORDERS_FRESH_MS = 15_000;

export function globalSources(): Record<GlobalVersionSubject, RecordingGlobalSource> {
  return {
    companies: new RecordingGlobalSource(
      "companies",
      ["b2b_companies:read"],
      COMPANIES_FRESH_MS,
      100,
    ),
    "orders-all": new RecordingGlobalSource(
      "orders-all",
      ["b2b_orders:read"],
      ALL_ORDERS_FRESH_MS,
      200,
    ),
  };
}

// L'instant du mur, comparé à lui-même seulement (fraîcheur, disjoncteur).
const WALL_START = new Date(Date.UTC(2030, 0, 1));

/** Les deux portes, leur objet, leur délai et leur mur, autour des sources données. */
export function handlerAround(
  all: readonly DayVersionSource[],
  globals: readonly GlobalVersionSource[] = Object.values(globalSources()),
) {
  const cache = new InMemoryDayVersionsCache();
  const deadline = new ScriptedCallDeadline();
  const wall = new FixedWallClock(WALL_START);
  const timings = new RecordingTimings();
  const resilient = new ResilientDayVersionsCache(
    cache,
    deadline,
    wall,
    new FixedStopwatch(3),
    timings,
  );
  const registry = new VersionRegistry(new DayVersionRegistry(all), globals);
  const scopes = new ScopeVersions(registry, resilient, wall);
  const handler = new GetDayVersionsHandler(registry, scopes);
  const versions = new GetVersionsHandler(registry, scopes);
  return { handler, versions, cache, deadline, wall, timings };
}

/** Laisse partir les rangements non attendus. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}
