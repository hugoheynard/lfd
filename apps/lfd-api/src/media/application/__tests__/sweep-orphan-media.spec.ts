import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { MediaStore, type StoredAsset } from "../../../platform/storage/media-store.js";
import {
  MediaLibrary,
  type MediaFacts,
  type RegisteredMedia,
} from "../../domain/ports/media-library.js";
import { MediaCarriers, type Carrier } from "../../channels/carriers/media-carriers.js";
import { MediaFailureLog, type LoggedFailure } from "../../domain/ports/media-failure-log.js";
import { SweepOrphanMediaHandler } from "../sweep-orphan-media.js";

/**
 * Ce que les PORTEURS répondent. Muet par défaut — personne n'affiche rien —
 * parce que c'est l'état qu'un ramassage vise.
 *
 * 🔴 Depuis que la clé étrangère est tombée, ce comptage EST la règle de Hugo :
 * « on ne supprime pas une image qui a été mappée quelque part ». Plus rien en
 * base ne la tient.
 */
class FakeCarriers extends MediaCarriers {
  constructor(private readonly counts: ReadonlyMap<string, number> = new Map()) {
    super();
  }

  usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(
      new Map(
        urls.flatMap((url) => {
          const count = this.counts.get(url);
          return count === undefined ? [] : [[url, count] as const];
        }),
      ),
    );
  }

  /**
   * Hors sujet ici — le ramassage ne nomme personne, il compte.
   *
   * 🔴 Mais le doublé doit porter le port ENTIER, sinon il dérive de ce qu'il
   * prétend jouer : le jour où le balayage lira les porteurs nommés, un faux
   * incomplet le laisserait vert sur du code qui ne peut pas tourner.
   */
  carriersOf(): Promise<readonly Carrier[]> {
    return Promise.resolve([]);
  }
}

const NOW = new Date("2026-08-22T04:00:00Z");

/** Le journal des gestes, dans l'ORDRE — c'est lui que le test principal lit. */
type Step = `remove:${string}` | `forget:${string}` | `check:${string}`;

class FakeLibrary extends MediaLibrary {
  /** La date-butoir reçue — c'est elle qui porte le délai de grâce. */
  cutoff: Date | null = null;

  constructor(
    private readonly candidates: readonly string[],
    private readonly stillOrphan: (key: string) => boolean,
    readonly steps: Step[] = [],
  ) {
    super();
  }

  findCandidates(before: Date): Promise<readonly { storageKey: string; url: string }[]> {
    this.cutoff = before;
    return Promise.resolve(
      this.candidates.map((storageKey) => ({
        storageKey,
        url: `https://media.test/${storageKey}`,
      })),
    );
  }

  stillOld(storageKey: string, before: Date): Promise<string | null> {
    this.cutoff = before;
    this.steps.push(`check:${storageKey}`);
    return Promise.resolve(
      this.stillOrphan(storageKey) ? `https://media.test/${storageKey}` : null,
    );
  }

  forget(storageKey: string): Promise<number> {
    this.steps.push(`forget:${storageKey}`);
    return Promise.resolve(2);
  }

  register(entry: Omit<RegisteredMedia, "id">): Promise<RegisteredMedia> {
    return Promise.resolve({ id: "media_1", ...entry });
  }

  factsFor(): Promise<MediaFacts | null> {
    return Promise.resolve(null);
  }
}

class FakeStore extends MediaStore {
  constructor(
    private readonly steps: Step[],
    private readonly failOn: string | null = null,
  ) {
    super();
  }

  put(): Promise<StoredAsset> {
    return Promise.reject(new Error("hors sujet"));
  }

  remove(storageKey: string): Promise<void> {
    this.steps.push(`remove:${storageKey}`);
    return storageKey === this.failOn ? Promise.reject(new Error("R2 refuse")) : Promise.resolve();
  }
}

/**
 * L'historique des refus, qui retient la DATE qu'on lui donne.
 *
 * C'est elle qu'on éprouve : la rétention se calcule par l'horloge, et un
 * doublé qui l'ignorerait laisserait passer un calcul faux — c'est-à-dire un
 * effacement trop large sur des lignes qu'on voulait garder.
 */
class SpyingFailures extends MediaFailureLog {
  cutoff: Date | null = null;

  constructor(private readonly forgotten = 0) {
    super();
  }

  record(): Promise<void> {
    return Promise.resolve();
  }

  recent(): Promise<readonly LoggedFailure[]> {
    return Promise.resolve([]);
  }

  forgetBefore(before: Date): Promise<number> {
    this.cutoff = before;
    return Promise.resolve(this.forgotten);
  }
}

function handler(
  candidates: readonly string[],
  stillOrphan: (key: string) => boolean = () => true,
  failOn: string | null = null,
  carried: ReadonlyMap<string, number> = new Map(),
  failures: SpyingFailures = new SpyingFailures(),
): {
  run: SweepOrphanMediaHandler;
  steps: Step[];
  library: FakeLibrary;
  failures: SpyingFailures;
} {
  const steps: Step[] = [];
  const library = new FakeLibrary(candidates, stillOrphan, steps);
  return {
    run: new SweepOrphanMediaHandler(
      library,
      new FakeStore(steps, failOn),
      new FakeCarriers(carried),
      failures,
      new FixedClock(NOW),
    ),
    steps,
    library,
    failures,
  };
}

describe("SweepOrphanMediaHandler", () => {
  it("supprime l'OBJET avant d'oublier les lignes", async () => {
    // L'ordre EST la sûreté. Oublier les lignes d'abord, puis échouer sur R2,
    // effacerait la seule trace de ce qu'il reste à supprimer : l'octet
    // resterait dans le bucket et plus rien ne pourrait le désigner.
    const { run, steps } = handler(["products/aa.png"]);

    await run.execute();

    expect(steps).toEqual([
      "check:products/aa.png",
      "remove:products/aa.png",
      "forget:products/aa.png",
    ]);
  });

  it("n'oublie AUCUNE ligne si la suppression de l'objet échoue", async () => {
    const { run, steps } = handler(["products/aa.png"], () => true, "products/aa.png");

    await expect(run.execute()).rejects.toThrow("R2 refuse");

    expect(steps).not.toContain("forget:products/aa.png");
  });

  it("épargne un candidat redevenu vivant entre le recensement et la suppression", async () => {
    // La fenêtre que le re-contrôle referme : quelqu'un a redéposé la même image
    // — mêmes octets, donc même clé — et l'a attachée à une fiche.
    const { run, steps } = handler(
      ["products/aa.png", "products/bb.png"],
      (key) => key !== "products/aa.png",
    );

    const report = await run.execute();

    expect(steps).not.toContain("remove:products/aa.png");
    expect(report).toMatchObject({ removed: 1, spared: 1, forgotten: 2 });
  });

  it("recule la date-butoir du délai de grâce, jamais « maintenant »", async () => {
    // Ce qui protège l'image DÉPOSÉE MAIS PAS ENCORE ENREGISTRÉE : elle n'a pas
    // de fiche, donc rien dans sa forme ne la distingue d'un orphelin. Sans ce
    // recul, le ramassage effacerait le travail en cours de quelqu'un.
    const { run, library } = handler(["products/aa.png"]);

    await run.execute();

    expect(library.cutoff).toEqual(new Date("2026-08-15T04:00:00Z"));
  });

  it("ne signale rien à faire quand il n'y a rien", async () => {
    const { run } = handler([]);

    expect(await run.execute()).toEqual({
      removed: 0,
      forgotten: 0,
      spared: 0,
      capped: false,
      // L'entretien de l'historique des refus est dans le MÊME rapport :
      // c'est le même passage qui le fait, et ouvrir un second cron pour
      // quelques lignes par jour coûterait un déclencheur et un secret de plus.
      failuresForgotten: 0,
    });
  });

  it("annonce le plafond plutôt que de tronquer en silence", async () => {
    // Un ramassage qui tronque sans le dire se lit comme un ramassage complet —
    // c'est ainsi qu'on croit un bucket propre pendant des mois.
    const full = Array.from({ length: 200 }, (_, i) => `products/${String(i)}.png`);
    const { run } = handler(full);

    expect((await run.execute()).capped).toBe(true);
  });

  it("oublie les refus passé leur RÉTENTION, et le dit dans le rapport", async () => {
    // Une table d'historique qui ne se vide jamais devient une dette
    // silencieuse — et un refus de l'an dernier ne désigne plus rien de
    // retrouvable : le fichier n'existe plus sur le disque de personne.
    const failures = new SpyingFailures(7);
    const { run } = handler([], () => true, null, new Map(), failures);

    const report = await run.execute();

    expect(report.failuresForgotten).toBe(7);
    // 90 jours avant l'horloge FIXE du test — jamais `new Date()`, sinon le
    // cas devient vrai un jour et faux le lendemain.
    const expected = new Date(NOW);
    expected.setUTCDate(expected.getUTCDate() - 90);
    expect(failures.cutoff?.toISOString()).toBe(expected.toISOString());
  });

  it("ramasse les refus MÊME quand aucune orpheline n'est trouvée", async () => {
    // Les deux entretiens sont indépendants : un fonds propre ne doit pas
    // faire grossir l'historique indéfiniment.
    const failures = new SpyingFailures(3);
    const { run } = handler([], () => true, null, new Map(), failures);

    const report = await run.execute();

    expect(report.removed).toBe(0);
    expect(report.failuresForgotten).toBe(3);
  });
});
