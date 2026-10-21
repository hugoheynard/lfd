import { ResupplyCutoff } from "../../domain/resupply-cutoff.js";
import { ResupplySiteLabels } from "../../domain/resupply-site-labels.js";
import { SiteResupply, type SiteResupplySnapshot } from "../../domain/site-resupply.js";
import { SiteResupplyReader } from "../../domain/site-resupply.reader.js";
import { SiteResupplyRepository } from "../../domain/site-resupply.repository.js";

/** L'instantané d'un réassort passé, tel que la base le rendrait. */
function snapshotOf(resupply: SiteResupply, version: number): SiteResupplySnapshot {
  const placed = resupply.placed;
  if (placed === null) {
    throw new TypeError("Le double ne garde que des réassorts passés, comme la base.");
  }
  return {
    id: resupply.id,
    siteId: resupply.siteId,
    target: resupply.target,
    serviceDay: resupply.serviceDay,
    version,
    lines: resupply.lines,
    placed,
    cancelled: resupply.cancelled,
  };
}

/**
 * Les réassorts en mémoire, lecture ET écriture : `save` garde le dernier
 * état, `load` le réhydrate sous le point demandé, comme le `where` de la base.
 */
export class InMemorySiteResupplies extends SiteResupplyRepository {
  private readonly rows = new Map<string, SiteResupplySnapshot>();
  saves = 0;

  load(siteId: string, resupplyId: string): Promise<SiteResupply | null> {
    const row = this.rows.get(resupplyId);
    return Promise.resolve(
      row === undefined || row.siteId !== siteId ? null : SiteResupply.restore(row),
    );
  }

  save(resupply: SiteResupply): Promise<void> {
    this.saves += 1;
    this.rows.set(resupply.id, snapshotOf(resupply, resupply.version + 1));
    return Promise.resolve();
  }

  all(): readonly SiteResupplySnapshot[] {
    return [...this.rows.values()];
  }
}

/** Le lecteur sur le même stockage. */
export class InMemorySiteResupplyReader extends SiteResupplyReader {
  constructor(private readonly store: InMemorySiteResupplies) {
    super();
  }

  forSite(siteId: string, days: readonly string[]): Promise<readonly SiteResupplySnapshot[]> {
    return Promise.resolve(
      this.store
        .all()
        .filter((row) => row.siteId === siteId && days.includes(row.serviceDay))
        .reverse(),
    );
  }

  placedOn(days: readonly string[]): Promise<readonly SiteResupplySnapshot[]> {
    return Promise.resolve(
      this.store.all().filter((row) => row.cancelled === null && days.includes(row.serviceDay)),
    );
  }
}

/** Une heure limite fixée par le test ; retient les journées demandées. */
export class FixedResupplyCutoff extends ResupplyCutoff {
  readonly asked: string[] = [];

  constructor(private readonly deadline: Date | null) {
    super();
  }

  deadlineFor(serviceDay: string): Promise<Date | null> {
    this.asked.push(serviceDay);
    return Promise.resolve(this.deadline);
  }
}

export class SiteLabels extends ResupplySiteLabels {
  constructor(private readonly known: ReadonlyMap<string, string>) {
    super();
  }

  labelsOf(siteIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(new Map([...this.known].filter(([id]) => siteIds.includes(id))));
  }
}
