import { Cached } from "../cached.js";

describe("Cached — le plafond d'appels ne dépend plus du nombre de lecteurs", () => {
  it("réutilise un résultat encore frais", async () => {
    let calls = 0;
    const cached = new Cached(1000, () => Promise.resolve(++calls));

    expect(await cached.read(0)).toBe(1);
    expect(await cached.read(999)).toBe(1);
  });

  it("repart quand le résultat a vieilli", async () => {
    let calls = 0;
    const cached = new Cached(1000, () => Promise.resolve(++calls));

    await cached.read(0);

    expect(await cached.read(1000)).toBe(2);
  });

  it("🔴 fait partager le MÊME appel à deux lectures simultanées", async () => {
    // Sans ça, deux onglets ouverts au même instant repartent tous les deux :
    // le cache laisserait passer exactement la rafale qu'il est là pour
    // empêcher, et le `429` arriverait quand même.
    let calls = 0;
    let release = (): void => {};
    const cached = new Cached(
      1000,
      () =>
        new Promise<number>((resolve) => {
          calls += 1;
          release = (): void => resolve(calls);
        }),
    );

    const both = Promise.all([cached.read(0), cached.read(0)]);
    release();

    expect(await both).toEqual([1, 1]);
    expect(calls).toBe(1);
  });

  it("ne met PAS un échec en cache", async () => {
    // Garder une panne en cache la ferait durer plus longtemps que la panne.
    let calls = 0;
    const cached = new Cached(10_000, () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("tiers muet")) : Promise.resolve(calls);
    });

    await expect(cached.read(0)).rejects.toThrow("tiers muet");

    expect(await cached.read(1)).toBe(2);
  });
});
