import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import {
  BakehouseResupplyDraft,
  type BakehouseResupplyDraftSnapshot,
} from "../../domain/bakehouse-resupply-draft.js";
import { BakehouseResupplyDraftChangedMeanwhileError } from "../../domain/bakehouse-resupply-draft-errors.js";
import { BakehouseResupplyDraftReader } from "../../domain/bakehouse-resupply-draft.reader.js";
import { BakehouseResupplyDraftRepository } from "../../domain/bakehouse-resupply-draft.repository.js";
import type { SiteResupply } from "../../domain/site-resupply.js";
import { InMemorySiteResupplies } from "./site-resupply-doubles.js";

/** Le fil des écritures, pour en vérifier l'ordre et l'unité de travail. */
export class WriteLog {
  readonly entries: string[] = [];
  depth = 0;
}

/** Une unité de travail sans transaction qui note où commence et finit chaque unité. */
export class LoggedUnitOfWork extends UnitOfWork {
  runs = 0;

  constructor(private readonly log: WriteLog) {
    super();
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.runs += 1;
    this.log.depth += 1;
    try {
      return await work();
    } finally {
      this.log.depth -= 1;
    }
  }
}

/** Les réassorts en mémoire, qui notent leurs écritures au fil. */
export class LoggedSiteResupplies extends InMemorySiteResupplies {
  constructor(private readonly log: WriteLog) {
    super();
  }

  override async save(resupply: SiteResupply): Promise<void> {
    await super.save(resupply);
    this.log.entries.push(`resupply:${resupply.id}:uow=${String(this.log.depth)}`);
  }
}

/** Les brouillons en mémoire, lecture ET écriture, avec le verrou de version de la base. */
export class InMemoryBakehouseDrafts extends BakehouseResupplyDraftRepository {
  private readonly rows = new Map<string, BakehouseResupplyDraftSnapshot>();

  constructor(private readonly log: WriteLog = new WriteLog()) {
    super();
  }

  load(draftId: string): Promise<BakehouseResupplyDraft | null> {
    const row = this.rows.get(draftId);
    return Promise.resolve(row === undefined ? null : BakehouseResupplyDraft.restore(row));
  }

  save(draft: BakehouseResupplyDraft): Promise<void> {
    const current = this.rows.get(draft.id);
    if (draft.version !== 0 && current?.version !== draft.version) {
      return Promise.reject(new BakehouseResupplyDraftChangedMeanwhileError());
    }
    this.rows.set(draft.id, { ...draft.snapshot(), version: draft.nextVersion });
    this.log.entries.push(`draft:${draft.id}:${draft.status}:uow=${String(this.log.depth)}`);
    return Promise.resolve();
  }

  row(draftId: string): BakehouseResupplyDraftSnapshot | undefined {
    return this.rows.get(draftId);
  }

  all(): readonly BakehouseResupplyDraftSnapshot[] {
    return [...this.rows.values()];
  }
}

/** Le lecteur sur le même stockage : les ouverts, le dernier écrit d'abord. */
export class InMemoryBakehouseDraftReader extends BakehouseResupplyDraftReader {
  constructor(private readonly store: InMemoryBakehouseDrafts) {
    super();
  }

  listOpen(): Promise<readonly BakehouseResupplyDraftSnapshot[]> {
    return Promise.resolve(
      this.store
        .all()
        .filter((row) => row.status === "open")
        .sort((a, b) => b.updated.at.getTime() - a.updated.at.getTime()),
    );
  }
}
