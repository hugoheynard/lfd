import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import {
  TvaRegimeNotFoundError,
  TvaTagConflictError,
} from "../../domain/errors/commerce-errors.js";
import {
  TvaRegimeRepository,
  type NewTvaRegime,
  type TvaRegimeRecord,
  type TvaRegimeUpdate,
} from "../../domain/ports/tva-regime.repository.js";
import { CreateTvaRegimeCommand, CreateTvaRegimeHandler } from "../create-tva-regime.js";
import { RemoveTvaRegimeCommand, RemoveTvaRegimeHandler } from "../remove-tva-regime.js";
import { tagFor } from "../tva-support.js";
import { UpdateTvaRegimeCommand, UpdateTvaRegimeHandler } from "../update-tva-regime.js";

class InMemoryRepo extends TvaRegimeRepository {
  readonly rows: TvaRegimeRecord[] = [];

  listAll(): Promise<TvaRegimeRecord[]> {
    return Promise.resolve([...this.rows]);
  }
  findById(id: string): Promise<TvaRegimeRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  findByTag(tag: string): Promise<TvaRegimeRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.tag === tag) ?? null);
  }
  insert(regime: NewTvaRegime): Promise<void> {
    this.rows.push(regime);
    return Promise.resolve();
  }
  update(id: string, update: TvaRegimeUpdate): Promise<void> {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows[index] = { id, ...update };
    }
    return Promise.resolve();
  }
  remove(id: string): Promise<void> {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows.splice(index, 1);
    }
    return Promise.resolve();
  }
}

class StubIds extends PimIdGenerator {
  next(): string {
    return "tva_fixed";
  }
}

describe("tagFor", () => {
  it("dérive le handle Shopify du taux", () => {
    expect(tagFor(5.5)).toBe("tva-5-5");
    expect(tagFor(10)).toBe("tva-10");
    expect(tagFor(20)).toBe("tva-20");
  });
});

describe("CreateTvaRegimeHandler", () => {
  it("dérive le tag, insère et renvoie l’id", async () => {
    const repo = new InMemoryRepo();
    const handler = new CreateTvaRegimeHandler(repo, new StubIds());

    const id = await handler.execute(new CreateTvaRegimeCommand({ name: "Réduit", percent: 5.5 }));

    expect(id).toBe("tva_fixed");
    expect(repo.rows[0]).toEqual({
      id: "tva_fixed",
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
    const repo = new InMemoryRepo();
    const handler = new UpdateTvaRegimeHandler(repo);

    await expect(
      handler.execute(new UpdateTvaRegimeCommand("absent", { name: "X", percent: 20 })),
    ).rejects.toBeInstanceOf(TvaRegimeNotFoundError);
  });

  it("met à jour et re-dérive le tag", async () => {
    const repo = new InMemoryRepo();
    await new CreateTvaRegimeHandler(repo, new StubIds()).execute(
      new CreateTvaRegimeCommand({ name: "Réduit", percent: 5.5 }),
    );

    await new UpdateTvaRegimeHandler(repo).execute(
      new UpdateTvaRegimeCommand("tva_fixed", {
        name: "Intermédiaire",
        percent: 10,
      }),
    );

    expect(repo.rows[0]).toEqual({
      id: "tva_fixed",
      name: "Intermédiaire",
      description: "",
      percent: 10,
      tag: "tva-10",
    });
  });
});

describe("RemoveTvaRegimeHandler", () => {
  it("supprime un régime existant", async () => {
    const repo = new InMemoryRepo();
    await new CreateTvaRegimeHandler(repo, new StubIds()).execute(
      new CreateTvaRegimeCommand({ name: "Réduit", percent: 5.5 }),
    );

    await new RemoveTvaRegimeHandler(repo).execute(new RemoveTvaRegimeCommand("tva_fixed"));

    expect(repo.rows).toHaveLength(0);
  });
});
