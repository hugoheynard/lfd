import {
  LaunchedResupplies,
  type ServiceDay,
} from "../../../../production/channels/commerce/index.js";
import { ResupplyCutoff } from "../../domain/resupply-cutoff.js";
import { ResupplyReceptions } from "../../domain/resupply-receptions.js";
import { ResupplySiteLabels } from "../../domain/resupply-site-labels.js";
import { ResupplyUsedNames } from "../../domain/resupply-used-names.js";
import {
  isPlaced,
  type PlacedSiteResupplySnapshot,
  type ResupplyTarget,
  SiteResupply,
  type SiteResupplySnapshot,
  type SiteResupplyTrace,
} from "../../domain/site-resupply.js";
import {
  SiteResupplyChangedMeanwhileError,
  SiteResupplyDraftOpenedMeanwhileError,
} from "../../domain/site-resupply-errors.js";
import { SiteResupplyReader } from "../../domain/site-resupply.reader.js";
import { SiteResupplyRepository } from "../../domain/site-resupply.repository.js";
import { TransferServedSites } from "../../domain/transfer-served-sites.js";

/** L'instantané d'un réassort, brouillon compris, tel que la base le rendrait. */
function snapshotOf(resupply: SiteResupply, version: number): SiteResupplySnapshot {
  return {
    id: resupply.id,
    siteId: resupply.siteId,
    target: resupply.target,
    serviceDay: resupply.serviceDay,
    version,
    origin: resupply.origin,
    name: resupply.name,
    lines: resupply.lines,
    placed: resupply.placed,
    cancelled: resupply.cancelled,
    arrived: resupply.arrived,
    launched: resupply.launched,
    departed: resupply.departed,
  };
}

/**
 * Les réassorts en mémoire, lecture ET écriture : `save` garde le dernier
 * état, `load` le réhydrate sous le point demandé, comme le `where` de la base.
 * Il tient aussi les deux refus de la base : le verrou de version, et une
 * seule demande en cours par (point, visée, journée).
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

  openDraft(
    siteId: string,
    target: ResupplyTarget,
    serviceDay: string,
  ): Promise<SiteResupply | null> {
    const row = this.openRow(siteId, target, serviceDay);
    return Promise.resolve(row === undefined ? null : SiteResupply.restore(row));
  }

  save(resupply: SiteResupply): Promise<void> {
    if (resupply.version === 0) {
      const open = this.openRow(resupply.siteId, resupply.target, resupply.serviceDay);
      if (resupply.placed === null && open !== undefined) {
        return Promise.reject(new SiteResupplyDraftOpenedMeanwhileError());
      }
    } else if (this.rows.get(resupply.id)?.version !== resupply.version) {
      return Promise.reject(new SiteResupplyChangedMeanwhileError());
    }
    this.saves += 1;
    this.rows.set(resupply.id, snapshotOf(resupply, resupply.version + 1));
    return Promise.resolve();
  }

  all(): readonly SiteResupplySnapshot[] {
    return [...this.rows.values()];
  }

  /** Range un état tel quel, comme un autre poste l'aurait écrit. */
  put(snapshot: SiteResupplySnapshot): void {
    this.rows.set(snapshot.id, snapshot);
  }

  private openRow(
    siteId: string,
    target: ResupplyTarget,
    serviceDay: string,
  ): SiteResupplySnapshot | undefined {
    return this.all().find(
      (row) =>
        row.siteId === siteId &&
        row.target === target &&
        row.serviceDay === serviceDay &&
        row.origin === "counter" &&
        row.placed === null,
    );
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

  placedOn(days: readonly string[]): Promise<readonly PlacedSiteResupplySnapshot[]> {
    return Promise.resolve(
      this.store
        .all()
        .filter(isPlaced)
        .filter((row) => row.cancelled === null && days.includes(row.serviceDay)),
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

/** Les réceptions connues, par (point, réassort) ; retient les questions posées. */
export class KnownReceptions extends ResupplyReceptions {
  readonly asked: string[] = [];
  private readonly known = new Map<string, SiteResupplyTrace>();

  receive(siteId: string, resupplyId: string, trace: SiteResupplyTrace): void {
    this.known.set(`${siteId}:${resupplyId}`, trace);
  }

  receptionOf(siteId: string, resupplyId: string): Promise<SiteResupplyTrace | null> {
    this.asked.push(`${siteId}:${resupplyId}`);
    return Promise.resolve(this.known.get(`${siteId}:${resupplyId}`) ?? null);
  }
}

/**
 * Les noms employés, lus sur le même stockage que la base les regrouperait :
 * distincts, du plus récent au plus ancien (ordre d'insertion inverse).
 */
export class InMemoryResupplyUsedNames extends ResupplyUsedNames {
  constructor(private readonly store: InMemorySiteResupplies) {
    super();
  }

  usedAt(siteId: string, limit: number): Promise<readonly string[]> {
    const names = this.store
      .all()
      .filter((row) => row.siteId === siteId)
      .reverse()
      .flatMap((row) => (row.name === null ? [] : [row.name]));
    return Promise.resolve([...new Set(names)].slice(0, limit));
  }
}

/** Les points servis par transfert, posés à la main (lot R3e). */
export class FixedTransferServedSites extends TransferServedSites {
  constructor(private readonly transferSites: readonly string[] = []) {
    super();
  }

  servedByTransfer(siteIds: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(siteIds.filter((id) => this.transferSites.includes(id))));
  }
}

/**
 * Le fournil doublé pour l'annulation d'un « au plus tôt » (R4a) : `launched`
 * dit quels réassorts il a lancés ; `asked` note chaque question, posée
 * sous le verrou de la journée.
 */
export class FixedLaunches extends LaunchedResupplies {
  readonly asked: string[] = [];

  constructor(readonly launched: Set<string> = new Set<string>()) {
    super();
  }

  isLaunched(day: ServiceDay, resupplyId: string): Promise<boolean> {
    this.asked.push(`${day.value}:${resupplyId}`);
    return Promise.resolve(this.launched.has(resupplyId));
  }
}
