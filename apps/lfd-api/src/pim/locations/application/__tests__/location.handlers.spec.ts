import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import {
  LocationInUseError,
  LocationNameRequiredError,
  LocationNameTakenError,
  LocationTableNotFoundError,
} from "../../domain/errors/locations-errors.js";
import { Location, type LocationSnapshot } from "../../domain/entities/location.js";
import { LocationRepository } from "../../domain/ports/location.repository.js";
import { LocationUsageReader } from "../../domain/ports/location-usage.reader.js";
import { TableTokenGenerator } from "../../domain/ports/table-token-generator.js";
import {
  CreateLocationCommand,
  CreateLocationHandler,
  type CreateLocationPayload,
} from "../create-location.js";
import { RemoveLocationCommand, RemoveLocationHandler } from "../remove-location.js";
import { RemoveTableQrCommand, RemoveTableQrHandler } from "../remove-table-qr.js";
import { GenerateTableQrCommand, GenerateTableQrHandler } from "../generate-table-qr.js";
import { ListLocationsHandler } from "../list-locations.js";
import { UpdateLocationCommand, UpdateLocationHandler } from "../update-location.js";

/**
 * Le faux dépôt garde des **instantanés**, pas des agrégats, et reconstitue à
 * chaque lecture : un test ne doit pas pouvoir passer parce qu'il tient la même
 * instance que le handler — ce que la vraie base ne fera jamais.
 */
class InMemoryLocations extends LocationRepository {
  readonly stored = new Map<string, LocationSnapshot>();

  listAll(): Promise<Location[]> {
    return Promise.resolve(
      [...this.stored.values()].map((snapshot) => Location.reconstitute(snapshot)),
    );
  }
  findById(id: string): Promise<Location | null> {
    const snapshot = this.stored.get(id);
    return Promise.resolve(snapshot === undefined ? null : Location.reconstitute(snapshot));
  }
  add(location: Location): Promise<void> {
    return this.save(location);
  }
  /**
   * Refuse un nom déjà pris, **insensible à la casse** — comme le vrai dépôt,
   * qui traduit la violation de `emplacement_name_unique` (index sur
   * `lower(name)`). Un double plus permissif que la production ferait passer
   * au vert des tests d'unicité qui ne tiennent rien.
   */
  save(location: Location): Promise<void> {
    const snapshot = location.snapshot();
    const wanted = snapshot.name.toLowerCase();
    const holder = [...this.stored.values()].find(
      (row) => row.name.toLowerCase() === wanted && row.id !== snapshot.id,
    );
    if (holder !== undefined) {
      return Promise.reject(new LocationNameTakenError(snapshot.name));
    }
    this.stored.set(snapshot.id, snapshot);
    return Promise.resolve();
  }
  /** Combien de familles citent chaque emplacement — posé par le test. */
  readonly referencedBy = new Map<string, number>();

  /**
   * Refuse un emplacement encore cité, **comme le vrai dépôt**, qui traduit la
   * violation de `category_location_ref_location_id_fkey`.
   *
   * Le refus vivait dans le handler, avant un compte lu séparément. Il est
   * descendu en base ; s'il ne descendait pas aussi dans le double, les tests
   * passeraient au vert sur un dépôt plus permissif que la production.
   */
  remove(id: string): Promise<void> {
    const referencing = this.referencedBy.get(id) ?? 0;
    if (referencing > 0) {
      return Promise.reject(new LocationInUseError(id, referencing));
    }
    this.stored.delete(id);
    return Promise.resolve();
  }

  /** Confort de lecture pour les assertions. */
  at(id: string): LocationSnapshot {
    const snapshot = this.stored.get(id);
    if (snapshot === undefined) {
      throw new Error(`location ${id} absent du faux dépôt`);
    }
    return snapshot;
  }

  get rows(): LocationSnapshot[] {
    return [...this.stored.values()];
  }
}

/** Combien de familles citent chaque emplacement — fixé par le test. */
class StubUsage extends LocationUsageReader {
  constructor(private readonly byId: ReadonlyMap<string, number> = new Map()) {
    super();
  }
  countByLocation(): Promise<ReadonlyMap<string, number>> {
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
const idsOf = new WeakMap<InMemoryLocations, StubIds>();

function open(repo: InMemoryLocations, over: Partial<CreateLocationPayload> = {}): Promise<string> {
  // UN générateur par dépôt : en construire un par appel les ferait tous
  // repartir de `emp_fixed`, donc s'écraser — le défaut qu'on vient de fermer.
  let ids = idsOf.get(repo);
  if (ids === undefined) {
    ids = new StubIds();
    idsOf.set(repo, ids);
  }
  return new CreateLocationHandler(
    repo,
    ids,
    new RecordingJournal(),
    new DirectUnitOfWork(),
  ).execute(
    new CreateLocationCommand({
      name: "Boutique",
      clickCollect: true,
      eatIn: false,
      baseUrl: "",
      tableCount: 0,
      ...over,
    }),
  );
}

function createSurPlace(repo: InMemoryLocations, tableCount: number) {
  return new CreateLocationHandler(
    repo,
    new StubIds(),
    new RecordingJournal(),
    new DirectUnitOfWork(),
  ).execute(
    new CreateLocationCommand({
      name: "Boutique",
      clickCollect: true,
      eatIn: true,
      baseUrl: "https://order.example",
      tableCount,
    }),
  );
}

describe("CreateLocationHandler", () => {
  it("ouvre une grille de tables quand il fait sur place", async () => {
    const repo = new InMemoryLocations();
    const id = await createSurPlace(repo, 3);

    expect(id).toBe("emp_fixed");
    expect(repo.rows[0]?.tables.map((t) => t.number)).toEqual([1, 2, 3]);
  });

  it("ne crée aucune table quand il ne fait pas sur place", async () => {
    const repo = new InMemoryLocations();
    await new CreateLocationHandler(
      repo,
      new StubIds(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(
      new CreateLocationCommand({
        name: "En ligne",
        clickCollect: true,
        eatIn: false,
        baseUrl: "",
        tableCount: 5,
      }),
    );

    expect(repo.rows[0]?.tables).toEqual([]);
  });

  it("refuse un nom vide", async () => {
    const repo = new InMemoryLocations();
    await expect(
      new CreateLocationHandler(
        repo,
        new StubIds(),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(
        new CreateLocationCommand({
          name: "   ",
          clickCollect: true,
          eatIn: false,
          baseUrl: "",
          tableCount: 0,
        }),
      ),
    ).rejects.toBeInstanceOf(LocationNameRequiredError);
  });
});

describe("UpdateLocationHandler", () => {
  it("re-synchronise les tables en gardant l’état QR existant", async () => {
    const repo = new InMemoryLocations();
    await createSurPlace(repo, 3);
    await new GenerateTableQrHandler(
      repo,
      new StubTokens(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new GenerateTableQrCommand("emp_fixed", 2));

    await new UpdateLocationHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
      new UpdateLocationCommand("emp_fixed", { tableCount: 4 }),
    );

    const tables = repo.rows[0]?.tables ?? [];
    expect(tables.map((t) => t.number)).toEqual([1, 2, 3, 4]);
    expect(tables.find((t) => t.number === 2)?.token).toBe("tok_fixed");
    expect(tables.find((t) => t.number === 4)?.qrCreated).toBe(false);
  });

  it("vide les tables quand on coupe le sur place", async () => {
    const repo = new InMemoryLocations();
    await createSurPlace(repo, 2);

    await new UpdateLocationHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
      new UpdateLocationCommand("emp_fixed", { eatIn: false }),
    );

    expect(repo.rows[0]?.tables).toEqual([]);
  });
});

describe("GenerateTableQrHandler", () => {
  it("pose un token neuf sur la table", async () => {
    const repo = new InMemoryLocations();
    await createSurPlace(repo, 2);

    const token = await new GenerateTableQrHandler(
      repo,
      new StubTokens(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new GenerateTableQrCommand("emp_fixed", 1));

    expect(token).toBe("tok_fixed");
    expect(repo.rows[0]?.tables[0]?.qrCreated).toBe(true);
  });

  it("refuse une table inexistante", async () => {
    const repo = new InMemoryLocations();
    await createSurPlace(repo, 1);

    await expect(
      new GenerateTableQrHandler(
        repo,
        new StubTokens(),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(new GenerateTableQrCommand("emp_fixed", 9)),
    ).rejects.toBeInstanceOf(LocationTableNotFoundError);
  });
});

describe("RemoveLocationHandler", () => {
  it("supprime l’emplacement", async () => {
    const repo = new InMemoryLocations();
    await createSurPlace(repo, 1);

    await new RemoveLocationHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
      new RemoveLocationCommand("emp_fixed"),
    );

    expect(repo.rows).toEqual([]);
  });
});

/**
 * Le refus vient du DÉPÔT, pas du handler : les canaux d'une gamme citent
 * l'emplacement dans un `jsonb`, et `category_location_ref` porte la clé
 * étrangère `Restrict` qu'aucune colonne ne pouvait porter. Ces cas vérifient
 * que le handler laisse passer le refus au lieu de l'avaler.
 */
describe("RemoveLocationHandler — la protection", () => {
  it("laisse passer le refus d'un emplacement encore cité", async () => {
    const repo = new InMemoryLocations();
    const id = await createSurPlace(repo, 2);
    repo.referencedBy.set(id, 3);

    await expect(
      new RemoveLocationHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
        new RemoveLocationCommand(id),
      ),
    ).rejects.toThrow(LocationInUseError);

    expect(repo.rows).toHaveLength(1);
  });

  it("DIT combien de familles bloquent — sans quoi on les cherche à la main", async () => {
    const repo = new InMemoryLocations();
    const id = await createSurPlace(repo, 1);
    repo.referencedBy.set(id, 2);

    await expect(
      new RemoveLocationHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
        new RemoveLocationCommand(id),
      ),
    ).rejects.toThrow(/2 famille/);
  });

  it("supprime quand plus personne ne le cite", async () => {
    const repo = new InMemoryLocations();
    const id = await createSurPlace(repo, 1);

    await new RemoveLocationHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
      new RemoveLocationCommand(id),
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
  it("refuse un second location du même nom", async () => {
    const repo = new InMemoryLocations();
    await open(repo, { name: "Village" });

    await expect(open(repo, { name: "Village" })).rejects.toBeInstanceOf(LocationNameTakenError);
  });

  it("refuse aussi une casse différente — c'est le même point de vente à l'écran", async () => {
    const repo = new InMemoryLocations();
    await open(repo, { name: "Village" });

    await expect(open(repo, { name: "  village " })).rejects.toBeInstanceOf(LocationNameTakenError);
  });

  it("refuse un renommage qui prend le nom d'un autre", async () => {
    const repo = new InMemoryLocations();
    await open(repo, { name: "Village" });
    const second = await open(repo, { name: "Labo" });

    await expect(
      new UpdateLocationHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
        new UpdateLocationCommand(second, { name: "Village" }),
      ),
    ).rejects.toBeInstanceOf(LocationNameTakenError);
  });

  it("laisse un emplacement garder son propre nom", async () => {
    const repo = new InMemoryLocations();
    const id = await open(repo, { name: "Village" });

    await new UpdateLocationHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
      new UpdateLocationCommand(id, { name: "Village", clickCollect: false }),
    );

    expect(repo.at(id).clickCollect).toBe(false);
  });

  it("n'écrit RIEN quand il refuse la création", async () => {
    const repo = new InMemoryLocations();
    await open(repo, { name: "Village" });

    await expect(open(repo, { name: "Village" })).rejects.toBeInstanceOf(LocationNameTakenError);
    expect(repo.rows).toHaveLength(1);
  });
});

describe("ListLocationsHandler", () => {
  /**
   * Le compte ne vit pas dans l'agrégat — un emplacement ignore les familles
   * qui le cochent. C'est une donnée de LECTURE, jointe ici pour que l'écran
   * puisse dire qu'une suppression échouera AVANT qu'on clique.
   */
  it("joint le compte de familles à chaque emplacement", async () => {
    const repo = new InMemoryLocations();
    const id = await open(repo, { name: "Village" });
    const usage = new StubUsage(new Map([[id, 3]]));

    const [row] = await new ListLocationsHandler(repo, usage).execute();

    expect(row?.usedByCategories).toBe(3);
  });

  it("rend 0 — jamais `undefined` — pour un emplacement que personne ne coche", async () => {
    // Les emplacements sans usage sont ABSENTS de la table : un écran qui
    // lirait `undefined` afficherait « undefined famille(s) ».
    const repo = new InMemoryLocations();
    await open(repo, { name: "Village" });

    const [row] = await new ListLocationsHandler(repo, new StubUsage()).execute();

    expect(row?.usedByCategories).toBe(0);
  });
});

/**
 * Le journal des emplacements. Ce qu'on tient ici n'est pas « le handler appelle
 * le journal » — la porte `lint:journal-tracked` et le laissez-passer s'en
 * chargent — mais **ce qu'il affirme** : un fait nommé par geste, et rien
 * d'inscrit quand rien n'a bougé.
 */
describe("Ce que les emplacements inscrivent au journal", () => {
  it("nomme un fait par geste — ouverture, réglage, QR posé, QR retiré, suppression", async () => {
    const repo = new InMemoryLocations();
    const journal = new RecordingJournal();
    const uow = new DirectUnitOfWork();

    const id = await new CreateLocationHandler(repo, new StubIds(), journal, uow).execute(
      new CreateLocationCommand({
        name: "Village",
        clickCollect: true,
        eatIn: true,
        baseUrl: "https://order.example",
        tableCount: 2,
      }),
    );
    await new UpdateLocationHandler(repo, journal, uow).execute(
      new UpdateLocationCommand(id, { name: "Village haut" }),
    );
    await new GenerateTableQrHandler(repo, new StubTokens(), journal, uow).execute(
      new GenerateTableQrCommand(id, 1),
    );
    await new RemoveTableQrHandler(repo, journal, uow).execute(new RemoveTableQrCommand(id, 1));
    await new RemoveLocationHandler(repo, journal, uow).execute(new RemoveLocationCommand(id));

    expect(journal.types()).toEqual([
      "location.created",
      "location.updated",
      "location.table_qr_generated",
      "location.table_qr_removed",
      "location.deleted",
    ]);
  });

  /**
   * Le journal doit dire ce qui a été **écrit**, pas ce qui a été **demandé**.
   *
   * Il lisait la charge reçue. Deux écarts en découlaient, tous deux visibles
   * ici : le nom s'y inscrivait avec ses espaces alors que l'agrégat le nettoie,
   * et « 12 tables » demandées sans salle s'y inscrivaient comme 12 alors que
   * l'agrégat n'en ouvre aucune. On relisait l'historique d'un emplacement qui
   * n'a jamais existé.
   */
  it("inscrit à la création l'état de l'agrégat, pas la charge reçue", async () => {
    const repo = new InMemoryLocations();
    const journal = new RecordingJournal();

    await new CreateLocationHandler(repo, new StubIds(), journal, new DirectUnitOfWork()).execute(
      new CreateLocationCommand({
        name: "  Village  ",
        clickCollect: true,
        eatIn: false,
        baseUrl: "https://order.example",
        tableCount: 12,
      }),
    );

    expect(journal.entries[0]?.payload).toMatchObject({ name: "Village", tableCount: 0 });
  });

  /**
   * Le jeton vaut ACCÈS à la commande à cette table. Un journal se relit plus
   * largement que la table qui le porte : on trace le geste, pas le secret.
   */
  it("ne verse jamais le jeton d’un QR dans la charge utile", async () => {
    const repo = new InMemoryLocations();
    const journal = new RecordingJournal();
    const id = await createSurPlace(repo, 1);

    await new GenerateTableQrHandler(
      repo,
      new StubTokens(),
      journal,
      new DirectUnitOfWork(),
    ).execute(new GenerateTableQrCommand(id, 1));

    expect(JSON.stringify(journal.entries)).not.toContain("tok_fixed");
    expect(journal.entries[0]?.payload).toEqual({ table: 1 });
  });

  /**
   * L'écran renvoie la fiche entière à chaque enregistrement. Sans ce filtre,
   * l'historique d'un emplacement serait surtout fait de gestes sans effet.
   */
  it("n’inscrit rien quand l’enregistrement ne change rien", async () => {
    const repo = new InMemoryLocations();
    const journal = new RecordingJournal();
    const id = await open(repo, { name: "Village" });

    await new UpdateLocationHandler(repo, journal, new DirectUnitOfWork()).execute(
      new UpdateLocationCommand(id, { name: "Village", clickCollect: true }),
    );

    expect(journal.types()).toEqual([]);
  });

  /**
   * La suppression d'un emplacement est la seule **physique** du référentiel :
   * après elle, le nom n'existe plus que dans le journal.
   */
  it("emporte le nom dans le fait de suppression", async () => {
    const repo = new InMemoryLocations();
    const journal = new RecordingJournal();
    const id = await open(repo, { name: "Village" });

    await new RemoveLocationHandler(repo, journal, new DirectUnitOfWork()).execute(
      new RemoveLocationCommand(id),
    );

    expect(journal.entries[0]?.payload).toMatchObject({ name: "Village" });
  });
});
