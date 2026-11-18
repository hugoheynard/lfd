import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { UuidGenerator } from "../../../../../platform/id/uuid-generator.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { SalesContextRegistry } from "../../../sales-contexts/domain/ports/sales-context.registry.js";
import type { SalesContext } from "../../../sales-contexts/domain/value-objects/sales-context.js";
import { VatRate, type VatRateSnapshot } from "../../domain/entities/vat-rate.js";
import {
  VatRateConflictError,
  VatRateInUseError,
  VatRateNotFoundError,
} from "../../domain/errors/vat-rate-errors.js";
import { VatRateUsageReader } from "../../domain/ports/vat-rate-usage.reader.js";
import { RecordingVatRateLock } from "../../domain/ports/__tests__/recording-vat-rate-lock.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { VatRateRepository, type VatRateUsage } from "../../domain/ports/vat-rate.repository.js";
import { CreateVatRateCommand, CreateVatRateHandler } from "../create-vat-rate.js";
import { ListVatRatesHandler } from "../list-vat-rates.js";
import { ArchiveVatRateCommand, ArchiveVatRateHandler } from "../archive-vat-rate.js";
import { RestoreVatRateCommand, RestoreVatRateHandler } from "../restore-vat-rate.js";
import { UpdateVatRateCommand, UpdateVatRateHandler } from "../update-vat-rate.js";
import { RecordingCatalogReemission } from "../../../../shared/__tests__/catalog-emitter-doubles.js";
import { DirectPimContents } from "../../../../changes/application/__tests__/direct-pim-contents.js";

/** Garde des agrégats et reconstitue à chaque lecture — comme la vraie base. */
class InMemoryRepo extends VatRateRepository {
  readonly stored = new Map<string, VatRateSnapshot>();
  /** Lectures et écritures dans l'ordre — partagé avec le verrou doublé. */
  readonly log: string[] = [];

  listAll(): Promise<VatRate[]> {
    return Promise.resolve(
      [...this.stored.values()].map((snapshot) => VatRate.reconstitute(snapshot)),
    );
  }
  findById(id: string): Promise<VatRate | null> {
    this.log.push(`find:${id}`);
    const snapshot = this.stored.get(id);
    return Promise.resolve(snapshot === undefined ? null : VatRate.reconstitute(snapshot));
  }
  findByPercent(percent: number): Promise<VatRate | null> {
    const snapshot = [...this.stored.values()].find((row) => row.percent === percent);
    return Promise.resolve(snapshot === undefined ? null : VatRate.reconstitute(snapshot));
  }
  add(rate: VatRate): Promise<void> {
    return this.save(rate);
  }
  save(rate: VatRate): Promise<void> {
    const snapshot = rate.snapshot();
    this.stored.set(snapshot.id, snapshot);
    return Promise.resolve();
  }
  /** Comme la base : seul `archived_at` change, le reste de la ligne stockée reste. */
  saveArchival(rate: VatRate): Promise<void> {
    const { id, archivedAt } = rate.snapshot();
    const stored = this.stored.get(id);
    if (stored !== undefined) {
      this.stored.set(id, { ...stored, archivedAt });
    }
    this.log.push(`saveArchival:${id}`);
    return Promise.resolve();
  }
  /** Usages posés à la main par le test — la vraie base les compte. */
  readonly usage = new Map<string, VatRateUsage>();
  usageByRegime(): Promise<ReadonlyMap<string, VatRateUsage>> {
    return Promise.resolve(this.usage);
  }

  at(id: string): VatRateSnapshot | undefined {
    return this.stored.get(id);
  }
}

/**
 * Le registre des contextes : les trois d'origine, un contexte créé à l'écran
 * (`brunch`), et un contexte hors service — tous se nomment.
 */
class KnownContexts extends SalesContextRegistry {
  private readonly contexts: readonly SalesContext[] = [
    context("takeaway", "À emporter", true),
    context("eatIn", "Sur place", true),
    context("b2b", "Professionnels", true),
    context("brunch", "Brunch du dimanche", false),
  ];
  active(): Promise<readonly SalesContext[]> {
    return Promise.resolve(this.contexts.filter((entry) => entry.active));
  }
  all(): Promise<readonly SalesContext[]> {
    return Promise.resolve(this.contexts);
  }
  ensureRootContext(): Promise<void> {
    return Promise.resolve();
  }
}

function context(key: string, label: string, active: boolean): SalesContext {
  return {
    id: `ctx_${key}`,
    key,
    label,
    active,
    position: 0,
  };
}

class StubIds extends UuidGenerator {
  private count = 0;
  next(): string {
    this.count += 1;
    return `tva_${this.count}`;
  }
}

describe("CreateVatRateHandler", () => {
  it("valide le taux, insère et renvoie l’id", async () => {
    const repo = new InMemoryRepo();

    const id = await new CreateVatRateHandler(
      repo,
      new StubIds(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new CreateVatRateCommand({ name: "Réduit", percent: 5.5 }));

    expect(repo.at(id)).toEqual({
      id,
      name: "Réduit",
      description: "",
      percent: 5.5,
      archivedAt: null,
    });
  });

  it("refuse deux taux au même taux", async () => {
    const repo = new InMemoryRepo();
    const handler = new CreateVatRateHandler(
      repo,
      new StubIds(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    );
    await handler.execute(new CreateVatRateCommand({ name: "A", percent: 10 }));

    await expect(
      handler.execute(new CreateVatRateCommand({ name: "B", percent: 10 })),
    ).rejects.toBeInstanceOf(VatRateConflictError);
  });
});

describe("UpdateVatRateHandler", () => {
  it("jette si le taux n’existe pas", async () => {
    await expect(
      new UpdateVatRateHandler(
        new InMemoryRepo(),
        new KnownContexts(),
        new RecordingJournal(),
        new DirectUnitOfWork(),
        new RecordingCatalogReemission(),
      ).execute(new UpdateVatRateCommand("absent", { name: "X", percent: 20 })),
    ).rejects.toBeInstanceOf(VatRateNotFoundError);
  });

  it("met à jour le nom et le taux", async () => {
    const repo = new InMemoryRepo();
    const id = await new CreateVatRateHandler(
      repo,
      new StubIds(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new CreateVatRateCommand({ name: "Réduit", percent: 5.5 }));

    await new UpdateVatRateHandler(
      repo,
      new KnownContexts(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
      new RecordingCatalogReemission(),
    ).execute(new UpdateVatRateCommand(id, { name: "Intermédiaire", percent: 10 }));

    expect(repo.at(id)).toEqual({
      id,
      name: "Intermédiaire",
      description: "",
      percent: 10,
      archivedAt: null,
    });
  });

  /**
   * Le taux garde SON taux : le conflit ne se déclenche que contre un autre.
   * Sans l'exception, réviser un nom sans toucher au taux serait impossible.
   */
  it("laisse réviser un taux sans changer son taux", async () => {
    const repo = new InMemoryRepo();
    const id = await new CreateVatRateHandler(
      repo,
      new StubIds(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new CreateVatRateCommand({ name: "Réduit", percent: 5.5 }));

    await new UpdateVatRateHandler(
      repo,
      new KnownContexts(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
      new RecordingCatalogReemission(),
    ).execute(new UpdateVatRateCommand(id, { name: "Réduit alimentaire", percent: 5.5 }));

    expect(repo.at(id)?.name).toBe("Réduit alimentaire");
  });

  it("refuse de déplacer un taux sur le taux d’un autre", async () => {
    const repo = new InMemoryRepo();
    const create = new CreateVatRateHandler(
      repo,
      new StubIds(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    );
    const first = await create.execute(new CreateVatRateCommand({ name: "A", percent: 5.5 }));
    await create.execute(new CreateVatRateCommand({ name: "B", percent: 20 }));

    await expect(
      new UpdateVatRateHandler(
        repo,
        new KnownContexts(),
        new RecordingJournal(),
        new DirectUnitOfWork(),
        new RecordingCatalogReemission(),
      ).execute(new UpdateVatRateCommand(first, { name: "A", percent: 20 })),
    ).rejects.toBeInstanceOf(VatRateConflictError);
  });
});

/** Le compte de ce qui porte chaque taux, posé à la main par le test. */
class CountedHolders extends VatRateUsageReader {
  readonly holders = new Map<string, number>();
  holdersOf(rateId: string): Promise<number> {
    return Promise.resolve(this.holders.get(rateId) ?? 0);
  }
}

describe("ArchiveVatRateHandler / RestoreVatRateHandler", () => {
  const NOW = new Date();

  async function seeded(): Promise<{ repo: InMemoryRepo; id: string }> {
    const repo = new InMemoryRepo();
    const id = await new CreateVatRateHandler(
      repo,
      new StubIds(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new CreateVatRateCommand({ name: "Réduit", percent: 5.5 }));
    return { repo, id };
  }

  function archiver(repo: InMemoryRepo, usage: CountedHolders, journal: RecordingJournal) {
    return new ArchiveVatRateHandler(
      repo,
      new RecordingVatRateLock(repo.log),
      usage,
      journal,
      new FixedClock(NOW),
      new DirectUnitOfWork(),
      new RecordingCatalogReemission(),
    );
  }

  it("archive un taux que rien ne porte : la ligne reste, datée, et le fait est écrit", async () => {
    const { repo, id } = await seeded();
    const journal = new RecordingJournal();

    await archiver(repo, new CountedHolders(), journal).execute(new ArchiveVatRateCommand(id));

    expect(repo.at(id)?.archivedAt).toBe(NOW);
    expect(journal.types()).toEqual(["vat_rate.archived"]);
  });

  it("refuse d’archiver un taux qu’une fiche porte, sans rien écrire", async () => {
    const { repo, id } = await seeded();
    const usage = new CountedHolders();
    usage.holders.set(id, 1);
    const journal = new RecordingJournal();

    await expect(
      archiver(repo, usage, journal).execute(new ArchiveVatRateCommand(id)),
    ).rejects.toBeInstanceOf(VatRateInUseError);
    expect(repo.at(id)?.archivedAt).toBeNull();
    expect(journal.types()).toEqual([]);
  });

  it("rejouée sur un taux archivé, l’archive n’écrit ni ne trace rien", async () => {
    const { repo, id } = await seeded();
    await archiver(repo, new CountedHolders(), new RecordingJournal()).execute(
      new ArchiveVatRateCommand(id),
    );
    const journal = new RecordingJournal();

    await archiver(repo, new CountedHolders(), journal).execute(new ArchiveVatRateCommand(id));

    expect(journal.types()).toEqual([]);
  });

  it("restaure un taux archivé, et la restauration rejouée se tait", async () => {
    const { repo, id } = await seeded();
    await archiver(repo, new CountedHolders(), new RecordingJournal()).execute(
      new ArchiveVatRateCommand(id),
    );
    const journal = new RecordingJournal();
    const restore = new RestoreVatRateHandler(
      repo,
      new RecordingVatRateLock(repo.log),
      journal,
      new DirectUnitOfWork(),
      new RecordingCatalogReemission(),
    );

    await restore.execute(new RestoreVatRateCommand(id));
    await restore.execute(new RestoreVatRateCommand(id));

    expect(repo.at(id)?.archivedAt).toBeNull();
    expect(journal.types()).toEqual(["vat_rate.restored"]);
  });

  it("verrouille le taux AVANT de le charger, et n’écrit que la date d’archive", async () => {
    const { repo, id } = await seeded();
    repo.log.length = 0;

    await archiver(repo, new CountedHolders(), new RecordingJournal()).execute(
      new ArchiveVatRateCommand(id),
    );

    expect(repo.log).toEqual([`lock:archival:${id}`, `find:${id}`, `saveArchival:${id}`]);
  });

  it("refuse d’archiver un taux inconnu", async () => {
    await expect(
      archiver(new InMemoryRepo(), new CountedHolders(), new RecordingJournal()).execute(
        new ArchiveVatRateCommand("tva_absent"),
      ),
    ).rejects.toBeInstanceOf(VatRateNotFoundError);
  });
});

describe("ListVatRatesHandler", () => {
  it("joint le compte d’usages, et n’invente aucun contexte", async () => {
    const repo = new InMemoryRepo();
    // Un SEUL générateur : deux instances repartiraient de `tva_1` chacune, et
    // le second taux écraserait le premier.
    const create = new CreateVatRateHandler(
      repo,
      new StubIds(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    );
    await create.execute(new CreateVatRateCommand({ name: "Réduit", percent: 5.5 }));
    await create.execute(new CreateVatRateCommand({ name: "Normal", percent: 20 }));
    repo.usage.set("tva_1", { takeaway: 3, eatIn: 1 });

    const views = await new ListVatRatesHandler(repo, new DirectPimContents()).execute();

    // Un taux que personne ne vise rend une carte VIDE. Poser un zéro par
    // contexte reviendrait à nommer les contextes dans la réponse, donc à les
    // figer — c'est ce qui avait fait oublier le B2B pendant des mois.
    expect(views.map((view) => [view.percent, view.usage])).toEqual([
      [5.5, { takeaway: 3, eatIn: 1 }],
      [20, {}],
    ]);
  });
});

describe("Le journal du référentiel", () => {
  it("distingue un taux qui bouge d’un simple renommage, et fige la portée", async () => {
    const repo = new InMemoryRepo();
    const journal = new RecordingJournal();
    const id = await new CreateVatRateHandler(
      repo,
      new StubIds(),
      journal,
      new DirectUnitOfWork(),
    ).execute(new CreateVatRateCommand({ name: "Réduit", percent: 5.5 }));
    // Ce que ce taux touchait à l'instant du changement.
    repo.usage.set(id, { takeaway: 3, eatIn: 1, b2b: 2 });

    await new UpdateVatRateHandler(
      repo,
      new KnownContexts(),
      journal,
      new DirectUnitOfWork(),
      new RecordingCatalogReemission(),
    ).execute(new UpdateVatRateCommand(id, { name: "Intermédiaire", percent: 10 }));

    expect(journal.types()).toEqual([
      "vat_rate.created",
      "vat_rate.rate_changed",
      "vat_rate.renamed",
    ]);
    expect(journal.entries[1]).toMatchObject({
      subjectType: "vat_rate",
      subjectId: id,
      payload: { from: 5.5, to: 10 },
      // Des comptes par CONTEXTE, pas un rayon transitif : ce que le handler
      // savait, et tous les contextes — un taux B2B qui bouge sous « 0 / 0 »
      // était une trace qui disait que ça ne touchait personne.
      blast: { families: { takeaway: 3, eatIn: 1, b2b: 2 } },
    });
  });

  /**
   * Régression (lot D du plan des phrases, 2026-09-19) : la portée comptait
   * les contextes par leur seule clé, et un contexte créé à l'écran s'affichait
   * « brunch ». Le libellé est figé à l'écriture — un contexte hors service
   * compris, un contexte que le registre ignore omis plutôt qu'inventé.
   */
  it("fige le libellé du moment de chaque contexte que la portée compte", async () => {
    const repo = new InMemoryRepo();
    const journal = new RecordingJournal();
    const id = await new CreateVatRateHandler(
      repo,
      new StubIds(),
      journal,
      new DirectUnitOfWork(),
    ).execute(new CreateVatRateCommand({ name: "Réduit", percent: 5.5 }));
    repo.usage.set(id, { takeaway: 3, brunch: 1, disparu: 2 });

    await new UpdateVatRateHandler(
      repo,
      new KnownContexts(),
      journal,
      new DirectUnitOfWork(),
      new RecordingCatalogReemission(),
    ).execute(new UpdateVatRateCommand(id, { name: "Réduit", percent: 10 }));

    expect(journal.entries[1]?.payload).toMatchObject({
      contextLabels: { takeaway: "À emporter", brunch: "Brunch du dimanche" },
    });
    expect(journal.entries[1]?.payload["contextLabels"]).not.toHaveProperty("disparu");
    expect(journal.entries[1]?.blast).toEqual({ families: { takeaway: 3, brunch: 1, disparu: 2 } });
  });

  it("reste muet quand rien n’a changé", async () => {
    const repo = new InMemoryRepo();
    const journal = new RecordingJournal();
    const id = await new CreateVatRateHandler(
      repo,
      new StubIds(),
      journal,
      new DirectUnitOfWork(),
    ).execute(new CreateVatRateCommand({ name: "Réduit", percent: 5.5 }));

    await new UpdateVatRateHandler(
      repo,
      new KnownContexts(),
      journal,
      new DirectUnitOfWork(),
      new RecordingCatalogReemission(),
    ).execute(new UpdateVatRateCommand(id, { name: "Réduit", percent: 5.5 }));

    // Un formulaire réenregistré à l'identique n'est pas un fait.
    expect(journal.types()).toEqual(["vat_rate.created"]);
  });
});

describe("l’unicité de la valeur du taux", () => {
  it("refuse un second taux à la même valeur, création comme révision", async () => {
    // Deux « 5,5 % » côte à côte, et plus personne ne sait lequel une famille
    // vise — ni quelle collection de taxe leur handle commun désigne.
    const repo = new InMemoryRepo();
    const journal = new RecordingJournal();
    const create = new CreateVatRateHandler(repo, new StubIds(), journal, new DirectUnitOfWork());
    await create.execute(new CreateVatRateCommand({ name: "Réduit", percent: 5.5 }));
    const other = await create.execute(new CreateVatRateCommand({ name: "Normal", percent: 20 }));

    await expect(
      create.execute(new CreateVatRateCommand({ name: "Alimentaire", percent: 5.5 })),
    ).rejects.toBeInstanceOf(VatRateConflictError);

    await expect(
      new UpdateVatRateHandler(
        repo,
        new KnownContexts(),
        journal,
        new DirectUnitOfWork(),
        new RecordingCatalogReemission(),
      ).execute(new UpdateVatRateCommand(other, { name: "Normal", percent: 5.5 })),
    ).rejects.toBeInstanceOf(VatRateConflictError);
  });
});
