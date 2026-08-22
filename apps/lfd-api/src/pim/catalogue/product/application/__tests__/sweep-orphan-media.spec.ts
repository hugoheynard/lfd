import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { MediaStore, type StoredAsset } from "../../../../../platform/storage/media-store.js";
import {
  MediaLibrary,
  type MediaFacts,
  type RegisteredMedia,
} from "../../domain/ports/media-library.js";
import { SweepOrphanMediaCommand, SweepOrphanMediaHandler } from "../sweep-orphan-media.js";

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

  findOrphanKeys(before: Date): Promise<readonly string[]> {
    this.cutoff = before;
    return Promise.resolve(this.candidates);
  }

  isStillOrphan(storageKey: string, before: Date): Promise<boolean> {
    this.cutoff = before;
    this.steps.push(`check:${storageKey}`);
    return Promise.resolve(this.stillOrphan(storageKey));
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

function handler(
  candidates: readonly string[],
  stillOrphan: (key: string) => boolean = () => true,
  failOn: string | null = null,
): { run: SweepOrphanMediaHandler; steps: Step[]; library: FakeLibrary } {
  const steps: Step[] = [];
  const library = new FakeLibrary(candidates, stillOrphan, steps);
  return {
    run: new SweepOrphanMediaHandler(library, new FakeStore(steps, failOn), new FixedClock(NOW)),
    steps,
    library,
  };
}

describe("SweepOrphanMediaHandler", () => {
  it("supprime l'OBJET avant d'oublier les lignes", async () => {
    // L'ordre EST la sûreté. Oublier les lignes d'abord, puis échouer sur R2,
    // effacerait la seule trace de ce qu'il reste à supprimer : l'octet
    // resterait dans le bucket et plus rien ne pourrait le désigner.
    const { run, steps } = handler(["products/aa.png"]);

    await run.execute(new SweepOrphanMediaCommand());

    expect(steps).toEqual([
      "check:products/aa.png",
      "remove:products/aa.png",
      "forget:products/aa.png",
    ]);
  });

  it("n'oublie AUCUNE ligne si la suppression de l'objet échoue", async () => {
    const { run, steps } = handler(["products/aa.png"], () => true, "products/aa.png");

    await expect(run.execute(new SweepOrphanMediaCommand())).rejects.toThrow("R2 refuse");

    expect(steps).not.toContain("forget:products/aa.png");
  });

  it("épargne un candidat redevenu vivant entre le recensement et la suppression", async () => {
    // La fenêtre que le re-contrôle referme : quelqu'un a redéposé la même image
    // — mêmes octets, donc même clé — et l'a attachée à une fiche.
    const { run, steps } = handler(
      ["products/aa.png", "products/bb.png"],
      (key) => key !== "products/aa.png",
    );

    const report = await run.execute(new SweepOrphanMediaCommand());

    expect(steps).not.toContain("remove:products/aa.png");
    expect(report).toMatchObject({ removed: 1, spared: 1, forgotten: 2 });
  });

  it("recule la date-butoir du délai de grâce, jamais « maintenant »", async () => {
    // Ce qui protège l'image DÉPOSÉE MAIS PAS ENCORE ENREGISTRÉE : elle n'a pas
    // de fiche, donc rien dans sa forme ne la distingue d'un orphelin. Sans ce
    // recul, le ramassage effacerait le travail en cours de quelqu'un.
    const { run, library } = handler(["products/aa.png"]);

    await run.execute(new SweepOrphanMediaCommand());

    expect(library.cutoff).toEqual(new Date("2026-08-15T04:00:00Z"));
  });

  it("ne signale rien à faire quand il n'y a rien", async () => {
    const { run } = handler([]);

    expect(await run.execute(new SweepOrphanMediaCommand())).toEqual({
      removed: 0,
      forgotten: 0,
      spared: 0,
      capped: false,
    });
  });

  it("annonce le plafond plutôt que de tronquer en silence", async () => {
    // Un ramassage qui tronque sans le dire se lit comme un ramassage complet —
    // c'est ainsi qu'on croit un bucket propre pendant des mois.
    const full = Array.from({ length: 200 }, (_, i) => `products/${String(i)}.png`);
    const { run } = handler(full);

    expect((await run.execute(new SweepOrphanMediaCommand())).capped).toBe(true);
  });
});
