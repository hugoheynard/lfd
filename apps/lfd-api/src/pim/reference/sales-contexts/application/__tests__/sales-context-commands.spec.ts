import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { SalesContextAggregate } from "../../domain/entities/sales-context.entity.js";
import {
  RootSalesContextProtectedError,
  SalesContextKeyInvalidError,
  SalesContextInUseError,
  SalesContextKeyTakenError,
  SalesContextNotFoundError,
} from "../../domain/errors/sales-context-errors.js";
import {
  SalesContextRepository,
  type SalesContextUsage,
} from "../../domain/ports/sales-context.repository.js";
import { ROOT_CONTEXT_KEY } from "../../domain/value-objects/bootstrap-contexts.js";
import { CreateSalesContextCommand, CreateSalesContextHandler } from "../create-sales-context.js";
import {
  ArchiveSalesContextCommand,
  ArchiveSalesContextHandler,
} from "../archive-sales-context.js";
import {
  RestoreSalesContextCommand,
  RestoreSalesContextHandler,
} from "../restore-sales-context.js";
import { SalesContextUsageReader } from "../../domain/ports/sales-context-usage.reader.js";
import { RecordingSalesContextLock } from "../../domain/ports/__tests__/recording-sales-context-lock.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { UpdateSalesContextCommand, UpdateSalesContextHandler } from "../update-sales-context.js";

/**
 * La réémission du catalogue, comptée. Structurelle plutôt qu'héritée : le
 * référentiel ne lit pas l'intérieur du catalogue, même pour son double.
 */
class CountingReemission {
  everythingCalls = 0;
  productsOfCategories(): Promise<void> {
    return Promise.resolve();
  }
  products(): Promise<void> {
    return Promise.resolve();
  }
  everything(): Promise<{
    readonly categories: number;
    readonly products: number;
    readonly failedProducts: readonly string[];
  }> {
    this.everythingCalls += 1;
    return Promise.resolve({ categories: 0, products: 0, failedProducts: [] });
  }
}

/** Le registre en mémoire : il garde les agrégats et compte les écritures. */
class InMemorySalesContextRepository extends SalesContextRepository {
  readonly rows = new Map<string, ReturnType<SalesContextAggregate["snapshot"]>>();
  adds = 0;
  /** Les écritures d'une ligne existante — `save` comme `saveArchival`. */
  saves = 0;
  /** Lectures et écritures dans l'ordre — partagé avec le verrou doublé. */
  readonly log: string[] = [];

  seed(key: string, label: string, position: number): void {
    const context = SalesContextAggregate.open({
      id: `ctx_${key}`,
      key,
      label,
      active: true,
      position,
    });
    this.rows.set(key, context.snapshot());
  }

  findByKey(key: string): Promise<SalesContextAggregate | null> {
    this.log.push(`find:${key}`);
    const row = this.rows.get(key);
    return Promise.resolve(row === undefined ? null : SalesContextAggregate.reconstitute(row));
  }
  nextPosition(): Promise<number> {
    return Promise.resolve(this.rows.size);
  }
  add(context: SalesContextAggregate, _ticket: WriteTicket): Promise<void> {
    this.adds += 1;
    this.rows.set(context.key, context.snapshot());
    return Promise.resolve();
  }
  save(context: SalesContextAggregate, _ticket: WriteTicket): Promise<void> {
    this.saves += 1;
    this.rows.set(context.key, context.snapshot());
    return Promise.resolve();
  }
  /** Comme la base : seul `archived_at` change, le reste de la ligne stockée reste. */
  saveArchival(context: SalesContextAggregate, _ticket: WriteTicket): Promise<void> {
    this.saves += 1;
    this.log.push(`saveArchival:${context.key}`);
    const row = this.rows.get(context.key);
    if (row !== undefined) {
      this.rows.set(context.key, { ...row, archivedAt: context.snapshot().archivedAt });
    }
    return Promise.resolve();
  }
  usageByKey(): Promise<ReadonlyMap<string, SalesContextUsage>> {
    return Promise.resolve(new Map());
  }
  archivedKeys(): Promise<ReadonlySet<string>> {
    return Promise.resolve(
      new Set(
        [...this.rows.values()].filter((row) => row.archivedAt !== null).map((row) => row.key),
      ),
    );
  }
}

/** Les taux réglés sur chaque contexte, par identifiant, posés par le test. */
class CountedRates extends SalesContextUsageReader {
  readonly rated = new Map<string, number>();
  ratedBy(contextId: string): Promise<number> {
    return Promise.resolve(this.rated.get(contextId) ?? 0);
  }
}

const NOW = new Date();

function harness() {
  const contexts = new InMemorySalesContextRepository();
  const journal = new RecordingJournal();
  const reemission = new CountingReemission();
  const uow = new DirectUnitOfWork();
  const usage = new CountedRates();
  const lock = new RecordingSalesContextLock(contexts.log);
  return {
    contexts,
    usage,
    journal,
    reemission,
    create: new CreateSalesContextHandler(contexts, journal, uow),
    update: new UpdateSalesContextHandler(contexts, journal, uow, reemission),
    archive: new ArchiveSalesContextHandler(
      contexts,
      lock,
      usage,
      journal,
      new FixedClock(NOW),
      uow,
      reemission,
    ),
    restore: new RestoreSalesContextHandler(contexts, lock, journal, uow, reemission),
  };
}

describe("CreateSalesContextHandler", () => {
  it("ouvre un contexte en fin de registre, identifiant dérivé de la clé, et le journalise", async () => {
    const h = harness();
    h.contexts.seed(ROOT_CONTEXT_KEY, "Pro", 0);

    const key = await h.create.execute(
      new CreateSalesContextCommand({ key: " traiteur ", label: " Traiteur ", active: true }),
    );

    expect(key).toBe("traiteur");
    expect(h.contexts.rows.get("traiteur")).toEqual({
      id: "ctx_traiteur",
      key: "traiteur",
      label: "Traiteur",
      active: true,
      position: 1,
      archivedAt: null,
    });
    expect(h.contexts.adds).toBe(1);
    expect(h.journal.types()).toEqual(["sales_context.created"]);
    expect(h.journal.entries[0]?.payload).toMatchObject({ key: "traiteur", label: "Traiteur" });
  });

  it("refuse une clé déjà portée, même écrite avec des espaces, sans rien écrire", async () => {
    const h = harness();
    h.contexts.seed("traiteur", "Traiteur", 0);

    await expect(
      h.create.execute(
        new CreateSalesContextCommand({ key: " traiteur", label: "Autre", active: true }),
      ),
    ).rejects.toBeInstanceOf(SalesContextKeyTakenError);
    expect(h.contexts.adds).toBe(0);
    expect(h.journal.entries).toHaveLength(0);
  });

  it("refuse une clé mal formée avant toute écriture", async () => {
    const h = harness();

    await expect(
      h.create.execute(
        new CreateSalesContextCommand({ key: "Sur place", label: "x", active: true }),
      ),
    ).rejects.toBeInstanceOf(SalesContextKeyInvalidError);
    expect(h.contexts.adds).toBe(0);
  });
});

describe("UpdateSalesContextHandler", () => {
  it("règle le contexte, dit d'où l'on vient au journal et réémet le catalogue", async () => {
    const h = harness();
    h.contexts.seed("traiteur", "Traiteur", 1);

    await h.update.execute(
      new UpdateSalesContextCommand("traiteur", {
        label: "Traiteur pro",
        active: false,
        position: 4,
      }),
    );

    expect(h.contexts.rows.get("traiteur")).toMatchObject({
      label: "Traiteur pro",
      active: false,
      position: 4,
    });
    expect(h.journal.types()).toEqual(["sales_context.updated"]);
    expect(h.reemission.everythingCalls).toBe(1);
  });

  it("n'inscrit rien quand l'écran renvoie le contexte à l'identique, mais l'enregistre", async () => {
    const h = harness();
    h.contexts.seed("traiteur", "Traiteur", 1);

    await h.update.execute(
      new UpdateSalesContextCommand("traiteur", { label: "Traiteur", active: true, position: 1 }),
    );

    expect(h.journal.entries).toHaveLength(0);
    expect(h.contexts.saves).toBe(1);
  });

  it("jette si le contexte n'existe pas", async () => {
    const h = harness();

    await expect(
      h.update.execute(
        new UpdateSalesContextCommand("absent", { label: "x", active: true, position: 0 }),
      ),
    ).rejects.toBeInstanceOf(SalesContextNotFoundError);
    expect(h.reemission.everythingCalls).toBe(0);
  });

  it("laisse la racine se mettre hors service", async () => {
    const h = harness();
    h.contexts.seed(ROOT_CONTEXT_KEY, "Pro", 0);

    await h.update.execute(
      new UpdateSalesContextCommand(ROOT_CONTEXT_KEY, { label: "Pro", active: false, position: 0 }),
    );

    expect(h.contexts.rows.get(ROOT_CONTEXT_KEY)?.active).toBe(false);
  });
});

describe("ArchiveSalesContextHandler / RestoreSalesContextHandler", () => {
  it("archive un contexte ordinaire sans l'effacer, garde son nom au journal et réémet", async () => {
    const h = harness();
    h.contexts.seed("traiteur", "Traiteur", 1);

    await h.archive.execute(new ArchiveSalesContextCommand("traiteur"));

    expect(h.contexts.rows.get("traiteur")?.archivedAt).toBe(NOW);
    expect(h.journal.types()).toEqual(["sales_context.archived"]);
    expect(h.journal.entries[0]?.payload).toMatchObject({ key: "traiteur", label: "Traiteur" });
    expect(h.reemission.everythingCalls).toBe(1);
  });

  it("refuse d'archiver un contexte qui porte des taux, sans rien écrire", async () => {
    const h = harness();
    h.contexts.seed("traiteur", "Traiteur", 1);
    h.usage.rated.set("ctx_traiteur", 3);

    await expect(
      h.archive.execute(new ArchiveSalesContextCommand("traiteur")),
    ).rejects.toBeInstanceOf(SalesContextInUseError);
    expect(h.contexts.saves).toBe(0);
    expect(h.journal.entries).toHaveLength(0);
  });

  it("refuse d'archiver la racine, sans journal ni écriture", async () => {
    const h = harness();
    h.contexts.seed(ROOT_CONTEXT_KEY, "Pro", 0);

    await expect(
      h.archive.execute(new ArchiveSalesContextCommand(ROOT_CONTEXT_KEY)),
    ).rejects.toBeInstanceOf(RootSalesContextProtectedError);
    expect(h.contexts.saves).toBe(0);
    expect(h.journal.entries).toHaveLength(0);
  });

  it("verrouille le contexte AVANT de le charger, et n'écrit que la date d'archive", async () => {
    const h = harness();
    h.contexts.seed("traiteur", "Traiteur", 3);

    await h.archive.execute(new ArchiveSalesContextCommand("traiteur"));

    expect(h.contexts.log).toEqual([
      "lock:archival:traiteur",
      "find:traiteur",
      "saveArchival:traiteur",
    ]);
  });

  it("rejouée, l'archive n'écrit, ne trace ni ne réémet rien", async () => {
    const h = harness();
    h.contexts.seed("traiteur", "Traiteur", 1);
    await h.archive.execute(new ArchiveSalesContextCommand("traiteur"));

    await h.archive.execute(new ArchiveSalesContextCommand("traiteur"));

    expect(h.contexts.saves).toBe(1);
    expect(h.reemission.everythingCalls).toBe(1);
  });

  it("restaure un contexte archivé, et la restauration rejouée se tait", async () => {
    const h = harness();
    h.contexts.seed("traiteur", "Traiteur", 1);
    await h.archive.execute(new ArchiveSalesContextCommand("traiteur"));

    await h.restore.execute(new RestoreSalesContextCommand("traiteur"));
    await h.restore.execute(new RestoreSalesContextCommand("traiteur"));

    expect(h.contexts.rows.get("traiteur")?.archivedAt).toBeNull();
    expect(h.journal.types()).toEqual(["sales_context.archived", "sales_context.restored"]);
  });

  it("jette si le contexte n'existe pas", async () => {
    const h = harness();

    await expect(
      h.archive.execute(new ArchiveSalesContextCommand("absent")),
    ).rejects.toBeInstanceOf(SalesContextNotFoundError);
  });
});
