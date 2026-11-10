import { InMemoryPublicShelf, publicRig } from "./public-shelf-doubles.js";

/**
 * **La purge du rayon public** (C3, § 5) : un magasin de plus dans
 * l'éventail. Ces tests échouent si une purge de société purge Workers Cache,
 * si une purge « tout » l'oublie, ou si une purge perdue lève.
 */
const OPENED_AT = new Date(0);

function enabledRig() {
  const shelf = new InMemoryPublicShelf();
  shelf.enabled = true;
  return publicRig(shelf);
}

describe("PublicShelfPurge", () => {
  it("« tout » purge Workers Cache", async () => {
    const { purge, shelf, signals } = enabledRig();

    await purge.purge({ order: { kind: "all" }, windowOpenedAt: OPENED_AT });

    expect(shelf.purges).toBe(1);
    expect(signals.names()).toEqual(["public_purged"]);
  });

  it("une société ne le touche pas : ni relevé, ni purge", async () => {
    const { purge, shelf, signals } = enabledRig();

    await purge.purge({
      order: { kind: "companies", companyIds: ["co_a"] },
      windowOpenedAt: OPENED_AT,
    });

    expect(shelf.reads).toBe(0);
    expect(shelf.purges).toBe(0);
    expect(signals.emitted).toEqual([]);
  });

  it("drapeau éteint : rien n'a pu se garder, la purge est sautée et comptée", async () => {
    const { purge, shelf, signals } = publicRig();

    await purge.purge({ order: { kind: "all" }, windowOpenedAt: OPENED_AT });

    expect(shelf.purges).toBe(0);
    expect(signals.names()).toEqual(["public_purge_skipped"]);
  });

  it("état illisible : purge quand même, dans le doute", async () => {
    const { purge, shelf } = enabledRig();
    shelf.failure = "throws";

    await purge.purge({ order: { kind: "all" }, windowOpenedAt: OPENED_AT });

    expect(shelf.purges).toBe(1);
  });

  it("une purge refusée ne lève pas : elle est comptée, la durée de 30 s rattrape", async () => {
    const { purge, shelf, signals } = enabledRig();
    shelf.purgeFails = true;

    await expect(
      purge.purge({ order: { kind: "all" }, windowOpenedAt: OPENED_AT }),
    ).resolves.toBeUndefined();
    expect(signals.emitted).toContainEqual({
      name: "fallback",
      operation: "public_purge",
      reason: "unreadable",
    });
    expect(signals.names()).toContain("public_purge_failed");
  });
});
