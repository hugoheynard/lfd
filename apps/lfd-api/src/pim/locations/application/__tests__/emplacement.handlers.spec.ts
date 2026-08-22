import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import {
  EmplacementInUseError,
  EmplacementNameRequiredError,
  EmplacementNameTakenError,
  EmplacementTableNotFoundError,
} from "../../domain/errors/locations-errors.js";
import { Emplacement, type EmplacementSnapshot } from "../../domain/entities/emplacement.js";
import { EmplacementRepository } from "../../domain/ports/emplacement.repository.js";
import { EmplacementUsageReader } from "../../domain/ports/emplacement-usage.reader.js";
import { TableTokenGenerator } from "../../domain/ports/table-token-generator.js";
import {
  CreateEmplacementCommand,
  CreateEmplacementHandler,
  type CreateEmplacementPayload,
} from "../create-emplacement.js";
import { DeleteEmplacementCommand, DeleteEmplacementHandler } from "../delete-emplacement.js";
import { GenerateTableQrCommand, GenerateTableQrHandler } from "../generate-table-qr.js";
import { ListEmplacementsHandler } from "../list-emplacements.js";
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
  /** Insensible à la casse, comme le vrai dépôt : sinon le double ment. */
  findByName(name: string): Promise<Emplacement | null> {
    const wanted = name.trim().toLowerCase();
    const found = [...this.stored.values()].find((row) => row.name.toLowerCase() === wanted);
    return Promise.resolve(found === undefined ? null : Emplacement.reconstitute(found));
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
  constructor(
    private readonly count = 0,
    private readonly byId: ReadonlyMap<string, number> = new Map(),
  ) {
    super();
  }
  countCategoriesUsing(): Promise<number> {
    return Promise.resolve(this.count);
  }
  countByEmplacement(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(this.byId);
  }
}

/**
 * **Séquentiel**, pas fixe. Il rendait `"emp_fixed"` pour tous : deux créations
 * dans le même test s'écrasaient dans le dépôt, si bien qu'un test qui croyait
 * manipuler deux emplacements n'en avait qu'un — et toute règle qui parle des
 * AUTRES emplacements passait pour la seule raison qu'il n'y en avait pas.
 *
 * Le premier reste `emp_fixed`, pour que les tests qui le nomment tiennent.
 */
class StubIds extends PimIdGenerator {
  private count = 0;
  next(): string {
    this.count += 1;
    return this.count === 1 ? "emp_fixed" : `emp_${String(this.count)}`;
  }
}

class StubTokens extends TableTokenGenerator {
  next(): string {
    return "tok_fixed";
  }
}

/** Ouvre un emplacement quelconque ; seuls les champs cités comptent au test. */
const idsOf = new WeakMap<InMemoryEmplacements, StubIds>();

function open(
  repo: InMemoryEmplacements,
  over: Partial<CreateEmplacementPayload> = {},
): Promise<string> {
  // UN générateur par dépôt : en construire un par appel les ferait tous
  // repartir de `emp_fixed`, donc s'écraser — le défaut qu'on vient de fermer.
  let ids = idsOf.get(repo);
  if (ids === undefined) {
    ids = new StubIds();
    idsOf.set(repo, ids);
  }
  return new CreateEmplacementHandler(repo, ids).execute(
    new CreateEmplacementCommand({
      name: "Boutique",
      clickCollect: true,
      surPlace: false,
      baseUrl: "",
      tableCount: 0,
      ...over,
    }),
  );
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

describe("le nom d'un emplacement est unique", () => {
  /**
   * Dans la grille de canaux d'une famille, le nom est la SEULE chose qui
   * distingue une ligne d'une autre. Deux « Village » y font deux cases
   * identiques dont l'une vend et l'autre non.
   */
  it("refuse un second emplacement du même nom", async () => {
    const repo = new InMemoryEmplacements();
    await open(repo, { name: "Village" });

    await expect(open(repo, { name: "Village" })).rejects.toBeInstanceOf(EmplacementNameTakenError);
  });

  it("refuse aussi une casse différente — c'est le même point de vente à l'écran", async () => {
    const repo = new InMemoryEmplacements();
    await open(repo, { name: "Village" });

    await expect(open(repo, { name: "  village " })).rejects.toBeInstanceOf(
      EmplacementNameTakenError,
    );
  });

  it("refuse un renommage qui prend le nom d'un autre", async () => {
    const repo = new InMemoryEmplacements();
    await open(repo, { name: "Village" });
    const second = await open(repo, { name: "Labo" });

    await expect(
      new UpdateEmplacementHandler(repo).execute(
        new UpdateEmplacementCommand(second, { name: "Village" }),
      ),
    ).rejects.toBeInstanceOf(EmplacementNameTakenError);
  });

  it("laisse un emplacement garder son propre nom", async () => {
    const repo = new InMemoryEmplacements();
    const id = await open(repo, { name: "Village" });

    await new UpdateEmplacementHandler(repo).execute(
      new UpdateEmplacementCommand(id, { name: "Village", clickCollect: false }),
    );

    expect(repo.at(id).clickCollect).toBe(false);
  });

  it("n'écrit RIEN quand il refuse la création", async () => {
    const repo = new InMemoryEmplacements();
    await open(repo, { name: "Village" });

    await expect(open(repo, { name: "Village" })).rejects.toBeInstanceOf(EmplacementNameTakenError);
    expect(repo.rows).toHaveLength(1);
  });
});

describe("ListEmplacementsHandler", () => {
  /**
   * Le compte ne vit pas dans l'agrégat — un emplacement ignore les familles
   * qui le cochent. C'est une donnée de LECTURE, jointe ici pour que l'écran
   * puisse dire qu'une suppression échouera AVANT qu'on clique.
   */
  it("joint le compte de familles à chaque emplacement", async () => {
    const repo = new InMemoryEmplacements();
    const id = await open(repo, { name: "Village" });
    const usage = new StubUsage(0, new Map([[id, 3]]));

    const [row] = await new ListEmplacementsHandler(repo, usage).execute();

    expect(row?.usedByCategories).toBe(3);
  });

  it("rend 0 — jamais `undefined` — pour un emplacement que personne ne coche", async () => {
    // Les emplacements sans usage sont ABSENTS de la table : un écran qui
    // lirait `undefined` afficherait « undefined famille(s) ».
    const repo = new InMemoryEmplacements();
    await open(repo, { name: "Village" });

    const [row] = await new ListEmplacementsHandler(repo, new StubUsage()).execute();

    expect(row?.usedByCategories).toBe(0);
  });
});
