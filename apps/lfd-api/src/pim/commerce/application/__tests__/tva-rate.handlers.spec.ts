import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { TvaRate, type TvaRateSnapshot } from "../../domain/entities/tva-rate.js";
import { TvaRateNotFoundError, TvaRateConflictError } from "../../domain/errors/commerce-errors.js";
import { TvaRateRepository, type TvaRateUsage } from "../../domain/ports/tva-rate.repository.js";
import { CreateTvaRateCommand, CreateTvaRateHandler } from "../create-tva-rate.js";
import { ListTvaRatesHandler } from "../list-tva-rates.js";
import { RemoveTvaRateCommand, RemoveTvaRateHandler } from "../remove-tva-rate.js";
import { UpdateTvaRateCommand, UpdateTvaRateHandler } from "../update-tva-rate.js";

/** Garde des agrégats et reconstitue à chaque lecture — comme la vraie base. */
class InMemoryRepo extends TvaRateRepository {
  readonly stored = new Map<string, TvaRateSnapshot>();

  listAll(): Promise<TvaRate[]> {
    return Promise.resolve(
      [...this.stored.values()].map((snapshot) => TvaRate.reconstitute(snapshot)),
    );
  }
  findById(id: string): Promise<TvaRate | null> {
    const snapshot = this.stored.get(id);
    return Promise.resolve(snapshot === undefined ? null : TvaRate.reconstitute(snapshot));
  }
  findByPercent(percent: number): Promise<TvaRate | null> {
    const snapshot = [...this.stored.values()].find((row) => row.percent === percent);
    return Promise.resolve(snapshot === undefined ? null : TvaRate.reconstitute(snapshot));
  }
  add(rate: TvaRate): Promise<void> {
    return this.save(rate);
  }
  save(rate: TvaRate): Promise<void> {
    const snapshot = rate.snapshot();
    this.stored.set(snapshot.id, snapshot);
    return Promise.resolve();
  }
  remove(id: string): Promise<void> {
    this.stored.delete(id);
    return Promise.resolve();
  }
  /** Usages posés à la main par le test — la vraie base les compte. */
  readonly usage = new Map<string, TvaRateUsage>();
  usageByRegime(): Promise<ReadonlyMap<string, TvaRateUsage>> {
    return Promise.resolve(this.usage);
  }

  at(id: string): TvaRateSnapshot | undefined {
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

describe("CreateTvaRateHandler", () => {
  it("valide le taux, insère et renvoie l’id", async () => {
    const repo = new InMemoryRepo();

    const id = await new CreateTvaRateHandler(repo, new StubIds(), new RecordingJournal()).execute(
      new CreateTvaRateCommand({ name: "Réduit", percent: 5.5 }),
    );

    expect(repo.at(id)).toEqual({
      id,
      name: "Réduit",
      description: "",
      percent: 5.5,
    });
  });

  it("refuse deux taux au même taux", async () => {
    const repo = new InMemoryRepo();
    const handler = new CreateTvaRateHandler(repo, new StubIds(), new RecordingJournal());
    await handler.execute(new CreateTvaRateCommand({ name: "A", percent: 10 }));

    await expect(
      handler.execute(new CreateTvaRateCommand({ name: "B", percent: 10 })),
    ).rejects.toBeInstanceOf(TvaRateConflictError);
  });
});

describe("UpdateTvaRateHandler", () => {
  it("jette si le taux n’existe pas", async () => {
    await expect(
      new UpdateTvaRateHandler(new InMemoryRepo(), new RecordingJournal()).execute(
        new UpdateTvaRateCommand("absent", { name: "X", percent: 20 }),
      ),
    ).rejects.toBeInstanceOf(TvaRateNotFoundError);
  });

  it("met à jour le nom et le taux", async () => {
    const repo = new InMemoryRepo();
    const id = await new CreateTvaRateHandler(repo, new StubIds(), new RecordingJournal()).execute(
      new CreateTvaRateCommand({ name: "Réduit", percent: 5.5 }),
    );

    await new UpdateTvaRateHandler(repo, new RecordingJournal()).execute(
      new UpdateTvaRateCommand(id, { name: "Intermédiaire", percent: 10 }),
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
    const id = await new CreateTvaRateHandler(repo, new StubIds(), new RecordingJournal()).execute(
      new CreateTvaRateCommand({ name: "Réduit", percent: 5.5 }),
    );

    await new UpdateTvaRateHandler(repo, new RecordingJournal()).execute(
      new UpdateTvaRateCommand(id, { name: "Réduit alimentaire", percent: 5.5 }),
    );

    expect(repo.at(id)?.name).toBe("Réduit alimentaire");
  });

  it("refuse de déplacer un taux sur le taux d’un autre", async () => {
    const repo = new InMemoryRepo();
    const create = new CreateTvaRateHandler(repo, new StubIds(), new RecordingJournal());
    const first = await create.execute(new CreateTvaRateCommand({ name: "A", percent: 5.5 }));
    await create.execute(new CreateTvaRateCommand({ name: "B", percent: 20 }));

    await expect(
      new UpdateTvaRateHandler(repo, new RecordingJournal()).execute(
        new UpdateTvaRateCommand(first, { name: "A", percent: 20 }),
      ),
    ).rejects.toBeInstanceOf(TvaRateConflictError);
  });
});

describe("RemoveTvaRateHandler", () => {
  it("supprime un taux existant", async () => {
    const repo = new InMemoryRepo();
    const id = await new CreateTvaRateHandler(repo, new StubIds(), new RecordingJournal()).execute(
      new CreateTvaRateCommand({ name: "Réduit", percent: 5.5 }),
    );

    await new RemoveTvaRateHandler(repo, new RecordingJournal()).execute(
      new RemoveTvaRateCommand(id),
    );

    expect(repo.at(id)).toBeUndefined();
  });
});

describe("ListTvaRatesHandler", () => {
  it("joint le compte d’usages, et pose zéro sur un taux que personne ne vise", async () => {
    const repo = new InMemoryRepo();
    // Un SEUL générateur : deux instances repartiraient de `tva_1` chacune, et
    // le second taux écraserait le premier.
    const create = new CreateTvaRateHandler(repo, new StubIds(), new RecordingJournal());
    await create.execute(new CreateTvaRateCommand({ name: "Réduit", percent: 5.5 }));
    await create.execute(new CreateTvaRateCommand({ name: "Normal", percent: 20 }));
    repo.usage.set("tva_1", { b2b: 0, emporter: 3, surPlace: 1 });

    const views = await new ListTvaRatesHandler(repo).execute();

    // Le B2B compte comme les deux autres : c'est un canal de vente à part
    // entière, et un taux qu'il seul utilise ne doit pas paraître libre.
    expect(views.map((view) => [view.percent, view.usage])).toEqual([
      [5.5, { b2b: 0, emporter: 3, surPlace: 1 }],
      [20, { b2b: 0, emporter: 0, surPlace: 0 }],
    ]);
  });
});

describe("Le journal du référentiel", () => {
  it("distingue un taux qui bouge d’un simple renommage, et fige la portée", async () => {
    const repo = new InMemoryRepo();
    const journal = new RecordingJournal();
    const id = await new CreateTvaRateHandler(repo, new StubIds(), journal).execute(
      new CreateTvaRateCommand({ name: "Réduit", percent: 5.5 }),
    );
    // Ce que ce taux touchait à l'instant du changement.
    repo.usage.set(id, { b2b: 0, emporter: 3, surPlace: 1 });

    await new UpdateTvaRateHandler(repo, journal).execute(
      new UpdateTvaRateCommand(id, { name: "Intermédiaire", percent: 10 }),
    );

    expect(journal.types()).toEqual([
      "tax_rate.created",
      "tax_rate.rate_changed",
      "tax_rate.renamed",
    ]);
    expect(journal.entries[1]).toMatchObject({
      subjectType: "tva_rate",
      subjectId: id,
      payload: { from: 5.5, to: 10 },
      // Des comptes NOMMÉS, pas un rayon transitif : ce que le handler savait.
      blast: { familiesEmporter: 3, familiesSurPlace: 1 },
    });
  });

  it("reste muet quand rien n’a changé", async () => {
    const repo = new InMemoryRepo();
    const journal = new RecordingJournal();
    const id = await new CreateTvaRateHandler(repo, new StubIds(), journal).execute(
      new CreateTvaRateCommand({ name: "Réduit", percent: 5.5 }),
    );

    await new UpdateTvaRateHandler(repo, journal).execute(
      new UpdateTvaRateCommand(id, { name: "Réduit", percent: 5.5 }),
    );

    // Un formulaire réenregistré à l'identique n'est pas un fait.
    expect(journal.types()).toEqual(["tax_rate.created"]);
  });
});

describe("l’unicité de la valeur du taux", () => {
  it("refuse un second taux à la même valeur, création comme révision", async () => {
    // Deux « 5,5 % » côte à côte, et plus personne ne sait lequel une famille
    // vise — ni quelle collection de taxe leur handle commun désigne.
    const repo = new InMemoryRepo();
    const journal = new RecordingJournal();
    const create = new CreateTvaRateHandler(repo, new StubIds(), journal);
    await create.execute(new CreateTvaRateCommand({ name: "Réduit", percent: 5.5 }));
    const other = await create.execute(new CreateTvaRateCommand({ name: "Normal", percent: 20 }));

    await expect(
      create.execute(new CreateTvaRateCommand({ name: "Alimentaire", percent: 5.5 })),
    ).rejects.toBeInstanceOf(TvaRateConflictError);

    await expect(
      new UpdateTvaRateHandler(repo, journal).execute(
        new UpdateTvaRateCommand(other, { name: "Normal", percent: 5.5 }),
      ),
    ).rejects.toBeInstanceOf(TvaRateConflictError);
  });
});
