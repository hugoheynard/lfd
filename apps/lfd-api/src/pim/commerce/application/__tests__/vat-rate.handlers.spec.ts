import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { VatRate, type VatRateSnapshot } from "../../domain/entities/vat-rate.js";
import { VatRateNotFoundError, VatRateConflictError } from "../../domain/errors/commerce-errors.js";
import { VatRateRepository, type VatRateUsage } from "../../domain/ports/vat-rate.repository.js";
import { CreateVatRateCommand, CreateVatRateHandler } from "../create-vat-rate.js";
import { ListVatRatesHandler } from "../list-vat-rates.js";
import { RemoveVatRateCommand, RemoveVatRateHandler } from "../remove-vat-rate.js";
import { UpdateVatRateCommand, UpdateVatRateHandler } from "../update-vat-rate.js";

/** Garde des agrégats et reconstitue à chaque lecture — comme la vraie base. */
class InMemoryRepo extends VatRateRepository {
  readonly stored = new Map<string, VatRateSnapshot>();

  listAll(): Promise<VatRate[]> {
    return Promise.resolve(
      [...this.stored.values()].map((snapshot) => VatRate.reconstitute(snapshot)),
    );
  }
  findById(id: string): Promise<VatRate | null> {
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
  remove(id: string): Promise<void> {
    this.stored.delete(id);
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

class StubIds extends PimIdGenerator {
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
        new RecordingJournal(),
        new DirectUnitOfWork(),
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

    await new UpdateVatRateHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
      new UpdateVatRateCommand(id, { name: "Intermédiaire", percent: 10 }),
    );

    expect(repo.at(id)).toEqual({
      id,
      name: "Intermédiaire",
      description: "",
      percent: 10,
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

    await new UpdateVatRateHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
      new UpdateVatRateCommand(id, { name: "Réduit alimentaire", percent: 5.5 }),
    );

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
      new UpdateVatRateHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
        new UpdateVatRateCommand(first, { name: "A", percent: 20 }),
      ),
    ).rejects.toBeInstanceOf(VatRateConflictError);
  });
});

describe("RemoveVatRateHandler", () => {
  it("supprime un taux existant", async () => {
    const repo = new InMemoryRepo();
    const id = await new CreateVatRateHandler(
      repo,
      new StubIds(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new CreateVatRateCommand({ name: "Réduit", percent: 5.5 }));

    await new RemoveVatRateHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
      new RemoveVatRateCommand(id),
    );

    expect(repo.at(id)).toBeUndefined();
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
    repo.usage.set("tva_1", { emporter: 3, surPlace: 1 });

    const views = await new ListVatRatesHandler(repo).execute();

    // Un taux que personne ne vise rend une carte VIDE. Poser un zéro par
    // contexte reviendrait à nommer les contextes dans la réponse, donc à les
    // figer — c'est ce qui avait fait oublier le B2B pendant des mois.
    expect(views.map((view) => [view.percent, view.usage])).toEqual([
      [5.5, { emporter: 3, surPlace: 1 }],
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
    repo.usage.set(id, { emporter: 3, surPlace: 1, b2b: 2 });

    await new UpdateVatRateHandler(repo, journal, new DirectUnitOfWork()).execute(
      new UpdateVatRateCommand(id, { name: "Intermédiaire", percent: 10 }),
    );

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
      blast: { families: { emporter: 3, surPlace: 1, b2b: 2 } },
    });
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

    await new UpdateVatRateHandler(repo, journal, new DirectUnitOfWork()).execute(
      new UpdateVatRateCommand(id, { name: "Réduit", percent: 5.5 }),
    );

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
      new UpdateVatRateHandler(repo, journal, new DirectUnitOfWork()).execute(
        new UpdateVatRateCommand(other, { name: "Normal", percent: 5.5 }),
      ),
    ).rejects.toBeInstanceOf(VatRateConflictError);
  });
});
