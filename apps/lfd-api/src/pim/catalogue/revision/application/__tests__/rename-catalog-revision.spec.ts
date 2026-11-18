import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { PimJournal, type PimJournalEntry } from "../../../../journal/pim-journal.js";
import { CatalogRevision } from "../../domain/entities/catalog-revision.js";
import {
  RevisionAlreadyNamedError,
  RevisionNotFoundError,
} from "../../domain/errors/revision-errors.js";
import { CatalogRevisionRepository } from "../../domain/ports/catalog-revision.repository.js";
import {
  RenameCatalogRevisionCommand,
  RenameCatalogRevisionHandler,
} from "../rename-catalog-revision.js";

class SilentJournal extends PimJournal {
  readonly traced: PimJournalEntry[] = [];

  protected record(entry: PimJournalEntry): Promise<void> {
    this.traced.push(entry);
    return Promise.resolve();
  }
}

class PassThroughUnitOfWork extends UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

class StubRepository extends CatalogRevisionRepository {
  readonly saved: CatalogRevision[] = [];

  constructor(private readonly found: CatalogRevision | null) {
    super();
  }

  load(): Promise<CatalogRevision | null> {
    return Promise.resolve(this.found);
  }

  save(revision: CatalogRevision): Promise<void> {
    this.saved.push(revision);
    return Promise.resolve();
  }

  loadByHash(): never {
    throw new Error("Non utilisé.");
  }
  add(): never {
    throw new Error("Non utilisé.");
  }
  list(): never {
    throw new Error("Non utilisé.");
  }
  byReference(): never {
    throw new Error("Non utilisé.");
  }
  indexOf(): never {
    throw new Error("Non utilisé.");
  }
  indexesOf(): never {
    throw new Error("Non utilisé.");
  }
  payloadsOf(): never {
    throw new Error("Non utilisé.");
  }
}

const anchor = (label: string | null) =>
  CatalogRevision.take({
    id: "rev_1",
    reference: "R-AAAAAA",
    label,
    note: null,
    hash: "h",
    takenAt: new Date(0),
    takenBy: "staff_1",
  });

function build(found: CatalogRevision | null) {
  const revisions = new StubRepository(found);
  const journal = new SilentJournal();
  return {
    handler: new RenameCatalogRevisionHandler(revisions, journal, new PassThroughUnitOfWork()),
    revisions,
    journal,
  };
}

describe("RenameCatalogRevisionHandler", () => {
  it("nomme l'ancre, la sauve et en laisse la trace", async () => {
    const { handler, revisions, journal } = build(anchor(null));

    await handler.execute(new RenameCatalogRevisionCommand("R-AAAAAA", "Rentrée", "pourquoi"));

    expect(revisions.saved[0]?.toState()).toMatchObject({ label: "Rentrée", note: "pourquoi" });
    expect(journal.traced[0]?.payload).toMatchObject({ label: "Rentrée", reference: "R-AAAAAA" });
  });

  it("refuse une ancre déjà nommée sans rien écrire ni tracer", async () => {
    const { handler, revisions, journal } = build(anchor("Premier"));

    await expect(
      handler.execute(new RenameCatalogRevisionCommand("R-AAAAAA", "Autre")),
    ).rejects.toBeInstanceOf(RevisionAlreadyNamedError);
    expect(revisions.saved).toHaveLength(0);
    expect(journal.traced).toHaveLength(0);
  });

  it("refuse une référence inconnue", async () => {
    const { handler } = build(null);

    await expect(
      handler.execute(new RenameCatalogRevisionCommand("R-ZZZZZZ", "Nom")),
    ).rejects.toBeInstanceOf(RevisionNotFoundError);
  });
});
