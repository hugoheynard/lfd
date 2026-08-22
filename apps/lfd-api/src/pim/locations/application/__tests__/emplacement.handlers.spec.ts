import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import {
  EmplacementInUseError,
  EmplacementNameRequiredError,
  EmplacementTableNotFoundError,
} from "../../domain/errors/locations-errors.js";
import { Emplacement, type EmplacementSnapshot } from "../../domain/entities/emplacement.js";
import { EmplacementRepository } from "../../domain/ports/emplacement.repository.js";
import { EmplacementUsageReader } from "../../domain/ports/emplacement-usage.reader.js";
import { TableTokenGenerator } from "../../domain/ports/table-token-generator.js";
import { CreateEmplacementCommand, CreateEmplacementHandler } from "../create-emplacement.js";
import { DeleteEmplacementCommand, DeleteEmplacementHandler } from "../delete-emplacement.js";
import { GenerateTableQrCommand, GenerateTableQrHandler } from "../generate-table-qr.js";
import { UpdateEmplacementCommand, UpdateEmplacementHandler } from "../update-emplacement.js";

/**
 * Le faux dépôt garde des **instantanés**, pas des agrégats, et reconstitue à
 * chaque lecture : un test ne doit pas pouvoir passer parce qu'il tient la même
 * instance que le handler — ce que la vraie base ne fera jamais.
 */
class InMemoryEmplacements extends EmplacementRepository {
  readonly stored = new Map<string, EmplacementSnapshot>();

  listAll(): Promise<Emplacement[]> {
    return Promise.resolve(
      [...this.stored.values()].map((snapshot) => Emplacement.reconstitute(snapshot)),
    );
  }
  findById(id: string): Promise<Emplacement | null> {
    const snapshot = this.stored.get(id);
    return Promise.resolve(snapshot === undefined ? null : Emplacement.reconstitute(snapshot));
  }
  add(emplacement: Emplacement): Promise<void> {
    return this.save(emplacement);
  }
  save(emplacement: Emplacement): Promise<void> {
    const snapshot = emplacement.snapshot();
    this.stored.set(snapshot.id, snapshot);
    return Promise.resolve();
  }
  remove(id: string): Promise<void> {
    this.stored.delete(id);
    return Promise.resolve();
  }

  /** Confort de lecture pour les assertions. */
  at(id: string): EmplacementSnapshot {
    const snapshot = this.stored.get(id);
    if (snapshot === undefined) {
      throw new Error(`emplacement ${id} absent du faux dépôt`);
    }
    return snapshot;
  }

  get rows(): EmplacementSnapshot[] {
    return [...this.stored.values()];
  }
}

/** Combien de familles cochent l'emplacement — fixé par le test. */
class StubUsage extends EmplacementUsageReader {
  constructor(private readonly count = 0) {
    super();
  }
  countCategoriesUsing(): Promise<number> {
    return Promise.resolve(this.count);
  }
}

class StubIds extends PimIdGenerator {
  next(): string {
    return "emp_fixed";
  }
}

class StubTokens extends TableTokenGenerator {
  next(): string {
    return "tok_fixed";
  }
}

function createSurPlace(repo: InMemoryEmplacements, tableCount: number) {
  return new CreateEmplacementHandler(repo, new StubIds()).execute(
    new CreateEmplacementCommand({
      name: "Boutique",
      clickCollect: true,
      surPlace: true,
      baseUrl: "https://order.example",
      tableCount,
    }),
  );
}

describe("CreateEmplacementHandler", () => {
  it("ouvre une grille de tables quand il fait sur place", async () => {
    const repo = new InMemoryEmplacements();
    const id = await createSurPlace(repo, 3);

    expect(id).toBe("emp_fixed");
    expect(repo.rows[0]?.tables.map((t) => t.number)).toEqual([1, 2, 3]);
  });

  it("ne crée aucune table quand il ne fait pas sur place", async () => {
    const repo = new InMemoryEmplacements();
    await new CreateEmplacementHandler(repo, new StubIds()).execute(
      new CreateEmplacementCommand({
        name: "En ligne",
        clickCollect: true,
        surPlace: false,
        baseUrl: "",
        tableCount: 5,
      }),
    );

    expect(repo.rows[0]?.tables).toEqual([]);
  });

  it("refuse un nom vide", async () => {
    const repo = new InMemoryEmplacements();
    await expect(
      new CreateEmplacementHandler(repo, new StubIds()).execute(
        new CreateEmplacementCommand({
          name: "   ",
          clickCollect: true,
          surPlace: false,
          baseUrl: "",
          tableCount: 0,
        }),
      ),
    ).rejects.toBeInstanceOf(EmplacementNameRequiredError);
  });
});

describe("UpdateEmplacementHandler", () => {
  it("re-synchronise les tables en gardant l’état QR existant", async () => {
    const repo = new InMemoryEmplacements();
    await createSurPlace(repo, 3);
    await new GenerateTableQrHandler(repo, new StubTokens()).execute(
      new GenerateTableQrCommand("emp_fixed", 2),
    );

    await new UpdateEmplacementHandler(repo).execute(
      new UpdateEmplacementCommand("emp_fixed", { tableCount: 4 }),
    );

    const tables = repo.rows[0]?.tables ?? [];
    expect(tables.map((t) => t.number)).toEqual([1, 2, 3, 4]);
    expect(tables.find((t) => t.number === 2)?.token).toBe("tok_fixed");
    expect(tables.find((t) => t.number === 4)?.qrCreated).toBe(false);
  });

  it("vide les tables quand on coupe le sur place", async () => {
    const repo = new InMemoryEmplacements();
    await createSurPlace(repo, 2);

    await new UpdateEmplacementHandler(repo).execute(
      new UpdateEmplacementCommand("emp_fixed", { surPlace: false }),
    );

    expect(repo.rows[0]?.tables).toEqual([]);
  });
});

describe("GenerateTableQrHandler", () => {
  it("pose un token neuf sur la table", async () => {
    const repo = new InMemoryEmplacements();
    await createSurPlace(repo, 2);

    const token = await new GenerateTableQrHandler(repo, new StubTokens()).execute(
      new GenerateTableQrCommand("emp_fixed", 1),
    );

    expect(token).toBe("tok_fixed");
    expect(repo.rows[0]?.tables[0]?.qrCreated).toBe(true);
  });

  it("refuse une table inexistante", async () => {
    const repo = new InMemoryEmplacements();
    await createSurPlace(repo, 1);

    await expect(
      new GenerateTableQrHandler(repo, new StubTokens()).execute(
        new GenerateTableQrCommand("emp_fixed", 9),
      ),
    ).rejects.toBeInstanceOf(EmplacementTableNotFoundError);
  });
});

describe("DeleteEmplacementHandler", () => {
  it("supprime l’emplacement", async () => {
    const repo = new InMemoryEmplacements();
    await createSurPlace(repo, 1);

    await new DeleteEmplacementHandler(repo, new StubUsage()).execute(
      new DeleteEmplacementCommand("emp_fixed"),
    );

    expect(repo.rows).toEqual([]);
  });
});

describe("DeleteEmplacementHandler — la protection", () => {
  it("REFUSE de supprimer un emplacement encore coché par des familles", async () => {
    // Les canaux d'une gamme référencent l'emplacement dans un `jsonb` : aucune
    // clé étrangère ne peut tenir cette référence, donc supprimer sous elle
    // laisserait des grilles pointant un point de vente disparu.
    const repo = new InMemoryEmplacements();
    const id = await createSurPlace(repo, 2);

    await expect(
      new DeleteEmplacementHandler(repo, new StubUsage(3)).execute(
        new DeleteEmplacementCommand(id),
      ),
    ).rejects.toThrow(EmplacementInUseError);

    expect(repo.rows).toHaveLength(1);
  });

  it("DIT combien de familles bloquent — sans quoi on les cherche à la main", async () => {
    const repo = new InMemoryEmplacements();
    const id = await createSurPlace(repo, 1);

    await expect(
      new DeleteEmplacementHandler(repo, new StubUsage(2)).execute(
        new DeleteEmplacementCommand(id),
      ),
    ).rejects.toThrow(/2 famille/);
  });

  it("supprime quand plus personne ne le coche", async () => {
    const repo = new InMemoryEmplacements();
    const id = await createSurPlace(repo, 1);

    await new DeleteEmplacementHandler(repo, new StubUsage(0)).execute(
      new DeleteEmplacementCommand(id),
    );

    expect(repo.rows).toEqual([]);
  });
});
