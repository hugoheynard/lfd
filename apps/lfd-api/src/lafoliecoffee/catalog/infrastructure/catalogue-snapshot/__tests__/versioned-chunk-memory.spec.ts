import { VersionedChunkMemory } from "../versioned-chunk-memory.js";

/** Un chargement qu'on termine à la main, et qui compte ses appels. */
class ManualLoads {
  calls = 0;
  private readonly pending: {
    readonly resolve: (value: string) => void;
    readonly reject: (error: Error) => void;
  }[] = [];

  load = (): Promise<string> => {
    this.calls += 1;
    return new Promise<string>((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  };

  finish(index: number, value: string): void {
    this.pending[index]?.resolve(value);
  }

  fail(index: number): void {
    this.pending[index]?.reject(new Error("lecture échouée"));
  }
}

const immediate = (value: string) => (): Promise<string> => Promise.resolve(value);

describe("VersionedChunkMemory — un morceau sous son numéro", () => {
  it("garde le morceau sous son numéro : le même numéro ne relit pas", async () => {
    const memory = new VersionedChunkMemory<string>();
    const loads = new ManualLoads();
    const first = memory.of(4n, loads.load);
    loads.finish(0, "catalogue n°4");
    await expect(first).resolves.toBe("catalogue n°4");
    await expect(memory.of(4n, loads.load)).resolves.toBe("catalogue n°4");
    expect(loads.calls).toBe(1);
  });

  it("relit quand le numéro a bougé, et ne sert jamais l'ancien morceau", async () => {
    const memory = new VersionedChunkMemory<string>();
    await memory.of(4n, immediate("n°4"));
    await expect(memory.of(5n, immediate("n°5"))).resolves.toBe("n°5");
  });

  it("ne sert pas un morceau plus RÉCENT que le numéro lu : seul le numéro exact sert", async () => {
    const memory = new VersionedChunkMemory<string>();
    await memory.of(5n, immediate("n°5"));
    await expect(memory.of(4n, immediate("relu pour n°4"))).resolves.toBe("relu pour n°4");
    // Le morceau gardé reste le plus récent.
    await expect(memory.of(5n, immediate("ne doit pas être relu"))).resolves.toBe("n°5");
  });

  it("une seule lecture en vol par numéro : dix demandes, un chargement", async () => {
    const memory = new VersionedChunkMemory<string>();
    const loads = new ManualLoads();
    const asked = Array.from({ length: 10 }, () => memory.of(7n, loads.load));
    loads.finish(0, "n°7");
    await expect(Promise.all(asked)).resolves.toEqual(Array.from({ length: 10 }, () => "n°7"));
    expect(loads.calls).toBe(1);
  });

  it("la borne : un chargement d'un numéro dépassé ne remplace pas le plus récent", async () => {
    const memory = new VersionedChunkMemory<string>();
    const loads = new ManualLoads();
    const older = memory.of(4n, loads.load);
    const newer = memory.of(5n, loads.load);
    loads.finish(1, "n°5");
    await newer;
    loads.finish(0, "n°4");
    await expect(older).resolves.toBe("n°4");
    await expect(memory.of(5n, immediate("ne doit pas être relu"))).resolves.toBe("n°5");
    await expect(memory.of(4n, immediate("relu"))).resolves.toBe("relu");
  });

  it("la borne : un chargement remplacé en vol ne se garde pas, même seul", async () => {
    const memory = new VersionedChunkMemory<string>();
    const loads = new ManualLoads();
    const first = memory.of(4n, loads.load);
    const second = memory.of(5n, loads.load);
    loads.finish(0, "n°4");
    await first;
    // n°4 n'est plus le chargement en cours : il n'est pas gardé.
    await expect(memory.of(4n, immediate("relu"))).resolves.toBe("relu");
    loads.finish(1, "n°5");
    await second;
  });

  it("numéro absent (ligne effacée) : relu à chaque demande, rien n'est gardé", async () => {
    const memory = new VersionedChunkMemory<string>();
    const loads = new ManualLoads();
    const first = memory.of(null, loads.load);
    const second = memory.of(null, loads.load);
    loads.finish(0, "a");
    loads.finish(1, "b");
    await expect(Promise.all([first, second])).resolves.toEqual(["a", "b"]);
    expect(loads.calls).toBe(2);
  });

  it("une lecture qui échoue ne se garde pas : la suivante réessaie", async () => {
    const memory = new VersionedChunkMemory<string>();
    const loads = new ManualLoads();
    const failing = memory.of(3n, loads.load);
    loads.fail(0);
    await expect(failing).rejects.toThrow("lecture échouée");
    const retry = memory.of(3n, loads.load);
    loads.finish(1, "n°3");
    await expect(retry).resolves.toBe("n°3");
    expect(loads.calls).toBe(2);
  });

  it("forget() vide : le même numéro est relu (la remise du harnais)", async () => {
    const memory = new VersionedChunkMemory<string>();
    await memory.of(2n, immediate("avant"));
    memory.forget();
    await expect(memory.of(2n, immediate("après"))).resolves.toBe("après");
  });
});
