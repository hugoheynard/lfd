import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import { TvaRegime, type TvaRegimeSnapshot } from "../../domain/entities/tva-regime.js";
import {
  TvaRegimeNotFoundError,
  TvaTagConflictError,
} from "../../domain/errors/commerce-errors.js";
import {
  TvaRegimeRepository,
  type TvaRegimeUsage,
} from "../../domain/ports/tva-regime.repository.js";
import { CreateTvaRegimeCommand, CreateTvaRegimeHandler } from "../create-tva-regime.js";
import { ListTvaRegimesHandler, ListTvaRegimesQuery } from "../list-tva-regimes.js";
import { RemoveTvaRegimeCommand, RemoveTvaRegimeHandler } from "../remove-tva-regime.js";
import { UpdateTvaRegimeCommand, UpdateTvaRegimeHandler } from "../update-tva-regime.js";

/** Garde des agrégats et reconstitue à chaque lecture — comme la vraie base. */
class InMemoryRepo extends TvaRegimeRepository {
  readonly stored = new Map<string, TvaRegimeSnapshot>();

  listAll(): Promise<TvaRegime[]> {
    return Promise.resolve(
      [...this.stored.values()].map((snapshot) => TvaRegime.reconstitute(snapshot)),
    );
  }
  findById(id: string): Promise<TvaRegime | null> {
    const snapshot = this.stored.get(id);
    return Promise.resolve(snapshot === undefined ? null : TvaRegime.reconstitute(snapshot));
  }
  findByTag(tag: string): Promise<TvaRegime | null> {
    const snapshot = [...this.stored.values()].find((row) => row.tag === tag);
    return Promise.resolve(snapshot === undefined ? null : TvaRegime.reconstitute(snapshot));
  }
  add(regime: TvaRegime): Promise<void> {
    return this.save(regime);
  }
  save(regime: TvaRegime): Promise<void> {
    const snapshot = regime.snapshot();
    this.stored.set(snapshot.id, snapshot);
    return Promise.resolve();
  }
  remove(id: string): Promise<void> {
    this.stored.delete(id);
    return Promise.resolve();
  }
  /** Usages posés à la main par le test — la vraie base les compte. */
  readonly usage = new Map<string, TvaRegimeUsage>();
  usageByRegime(): Promise<ReadonlyMap<string, TvaRegimeUsage>> {
    return Promise.resolve(this.usage);
  }

  at(id: string): TvaRegimeSnapshot | undefined {
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

describe("CreateTvaRegimeHandler", () => {
  it("dérive le tag, insère et renvoie l’id", async () => {
    const repo = new InMemoryRepo();

    const id = await new CreateTvaRegimeHandler(repo, new StubIds()).execute(
      new CreateTvaRegimeCommand({ name: "Réduit", percent: 5.5 }),
    );

    expect(repo.at(id)).toEqual({
      id,
      name: "Réduit",
      description: "",
      percent: 5.5,
      tag: "tva-5-5",
    });
  });

  it("refuse deux régimes au même taux (collision de tag)", async () => {
    const repo = new InMemoryRepo();
    const handler = new CreateTvaRegimeHandler(repo, new StubIds());
    await handler.execute(new CreateTvaRegimeCommand({ name: "A", percent: 10 }));

    await expect(
      handler.execute(new CreateTvaRegimeCommand({ name: "B", percent: 10 })),
    ).rejects.toBeInstanceOf(TvaTagConflictError);
  });
});

describe("UpdateTvaRegimeHandler", () => {
  it("jette si le régime n’existe pas", async () => {
    await expect(
      new UpdateTvaRegimeHandler(new InMemoryRepo()).execute(
        new UpdateTvaRegimeCommand("absent", { name: "X", percent: 20 }),
      ),
    ).rejects.toBeInstanceOf(TvaRegimeNotFoundError);
  });

  it("met à jour et re-dérive le tag", async () => {
    const repo = new InMemoryRepo();
    const id = await new CreateTvaRegimeHandler(repo, new StubIds()).execute(
      new CreateTvaRegimeCommand({ name: "Réduit", percent: 5.5 }),
    );

    await new UpdateTvaRegimeHandler(repo).execute(
      new UpdateTvaRegimeCommand(id, { name: "Intermédiaire", percent: 10 }),
    );

    expect(repo.at(id)).toEqual({
      id,
      name: "Intermédiaire",
      description: "",
      percent: 10,
      tag: "tva-10",
    });
  });

  /**
   * Le régime garde SON tag : le conflit ne se déclenche que contre un autre.
   * Sans l'exception, réviser un nom sans toucher au taux serait impossible.
   */
  it("laisse réviser un régime sans changer son taux", async () => {
    const repo = new InMemoryRepo();
    const id = await new CreateTvaRegimeHandler(repo, new StubIds()).execute(
      new CreateTvaRegimeCommand({ name: "Réduit", percent: 5.5 }),
    );

    await new UpdateTvaRegimeHandler(repo).execute(
      new UpdateTvaRegimeCommand(id, { name: "Réduit alimentaire", percent: 5.5 }),
    );

    expect(repo.at(id)?.name).toBe("Réduit alimentaire");
  });

  it("refuse de déplacer un régime sur le taux d’un autre", async () => {
    const repo = new InMemoryRepo();
    const create = new CreateTvaRegimeHandler(repo, new StubIds());
    const first = await create.execute(new CreateTvaRegimeCommand({ name: "A", percent: 5.5 }));
    await create.execute(new CreateTvaRegimeCommand({ name: "B", percent: 20 }));

    await expect(
      new UpdateTvaRegimeHandler(repo).execute(
        new UpdateTvaRegimeCommand(first, { name: "A", percent: 20 }),
      ),
    ).rejects.toBeInstanceOf(TvaTagConflictError);
  });
});

describe("RemoveTvaRegimeHandler", () => {
  it("supprime un régime existant", async () => {
    const repo = new InMemoryRepo();
    const id = await new CreateTvaRegimeHandler(repo, new StubIds()).execute(
      new CreateTvaRegimeCommand({ name: "Réduit", percent: 5.5 }),
    );

    await new RemoveTvaRegimeHandler(repo).execute(new RemoveTvaRegimeCommand(id));

    expect(repo.at(id)).toBeUndefined();
  });
});

describe("ListTvaRegimesHandler", () => {
  it("joint le compte d’usages, et pose zéro sur un régime que personne ne vise", async () => {
    const repo = new InMemoryRepo();
    // Un SEUL générateur : deux instances repartiraient de `tva_1` chacune, et
    // le second régime écraserait le premier.
    const create = new CreateTvaRegimeHandler(repo, new StubIds());
    await create.execute(new CreateTvaRegimeCommand({ name: "Réduit", percent: 5.5 }));
    await create.execute(new CreateTvaRegimeCommand({ name: "Normal", percent: 20 }));
    repo.usage.set("tva_1", { emporter: 3, surPlace: 1 });

    const views = await new ListTvaRegimesHandler(repo).execute(new ListTvaRegimesQuery());

    expect(views.map((view) => [view.tag, view.usage])).toEqual([
      ["tva-5-5", { emporter: 3, surPlace: 1 }],
      ["tva-20", { emporter: 0, surPlace: 0 }],
    ]);
  });
});
