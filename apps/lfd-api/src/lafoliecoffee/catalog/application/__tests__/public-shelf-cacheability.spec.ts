import { SHELF_BREAKER_FAILURES } from "../shelf-cache-breaker.js";
import { InMemoryPublicShelf, publicRig, type PublicShelfFailure } from "./public-shelf-doubles.js";
import { BrokenShelfCache, resilientAround } from "./shelf-cache-doubles.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PUBLIC_FLAG_MEMORY_MS, PublicShelfFlagMemory } from "../public-shelf-flag-memory.js";
import { PublicShelfCacheability } from "../public-shelf-cacheability.js";
import { ResilientPublicShelf } from "../resilient-public-shelf.js";

/**
 * **L'API décide de la cacheabilité, réponse par réponse** (C3, § 3). Ces
 * tests échouent si une réponse publique s'offre à Workers Cache drapeau
 * éteint, après une purge passée pendant son calcul, ou quand l'objet est en
 * panne — et si une panne empêche de servir le rayon (§ 4 bis).
 */
const VIEW = { items: ["baguette"] };

function rigWith(enabled: boolean) {
  const shelf = new InMemoryPublicShelf();
  shelf.enabled = enabled;
  shelf.version = 7;
  return publicRig(shelf);
}

describe("PublicShelfCacheability", () => {
  it("drapeau éteint par défaut : servi, jamais gardé, et un seul relevé", async () => {
    const { cacheability, shelf, signals } = publicRig();

    const reply = await cacheability.around(() => Promise.resolve(VIEW));

    expect(reply).toEqual({ view: VIEW, cacheable: false, reason: "disabled" });
    expect(shelf.reads).toBe(1);
    expect(signals.emitted).toEqual([{ name: "public_not_cacheable", reason: "disabled" }]);
  });

  it("drapeau allumé, rien n'a bougé : gardé, après deux relevés", async () => {
    const { cacheability, shelf, signals } = rigWith(true);

    const reply = await cacheability.around(() => Promise.resolve(VIEW));

    expect(reply).toEqual({ view: VIEW, cacheable: true });
    expect(shelf.reads).toBe(2);
    expect(signals.emitted).toEqual([{ name: "public_cacheable" }]);
  });

  it("une purge pendant le calcul : servi, jamais gardé", async () => {
    const { cacheability, shelf, signals } = rigWith(true);

    const reply = await cacheability.around(() => {
      shelf.writeDuringCompute();
      return Promise.resolve(VIEW);
    });

    expect(reply).toEqual({ view: VIEW, cacheable: false, reason: "version_moved" });
    expect(signals.emitted).toEqual([{ name: "public_not_cacheable", reason: "version_moved" }]);
  });

  it("le drapeau éteint pendant le calcul : jamais gardé", async () => {
    const { cacheability, shelf } = rigWith(true);

    const reply = await cacheability.around(() => {
      shelf.enabled = false;
      return Promise.resolve(VIEW);
    });

    expect(reply.cacheable).toBe(false);
  });

  it.each<PublicShelfFailure>(["throws", "unreadable", "hangs"])(
    "objet en panne (%s) : le rayon est servi, jamais gardé",
    async (failure) => {
      const { cacheability, shelf, signals, deadline } = rigWith(true);
      shelf.failure = failure;
      deadline.late = failure === "hangs";

      const reply = await cacheability.around(() => Promise.resolve(VIEW));

      expect(reply).toEqual({ view: VIEW, cacheable: false, reason: "unavailable" });
      expect(signals.emitted.at(-1)).toEqual({
        name: "public_not_cacheable",
        reason: "unavailable",
      });
    },
  );

  it("partage le disjoncteur du rayon pro : ouvert par le pro, le public ne l'appelle plus", async () => {
    const rig = resilientAround(new BrokenShelfCache("throws"));
    const shelf = new InMemoryPublicShelf();
    shelf.enabled = true;
    const cacheability = new PublicShelfCacheability(
      new ResilientPublicShelf(
        shelf,
        shelf,
        rig.guard,
        rig.signals,
        new PublicShelfFlagMemory(new FixedClock(new Date(0))),
      ),
      rig.signals,
    );
    for (let i = 0; i < SHELF_BREAKER_FAILURES; i += 1) {
      await rig.resilient.read("co_a", new Date(0));
    }

    const reply = await cacheability.around(() => Promise.resolve(VIEW));

    expect(reply.cacheable).toBe(false);
    expect(shelf.reads).toBe(0);
    expect(rig.signals.emitted).toContainEqual({
      name: "fallback",
      operation: "public_state",
      reason: "breaker_open",
    });
  });

  it("une erreur du calcul lui-même remonte : le cache ne la masque pas", async () => {
    const { cacheability } = rigWith(true);

    await expect(
      cacheability.around(() => Promise.reject(new RangeError("base"))),
    ).rejects.toBeInstanceOf(RangeError);
  });
});

/**
 * **La mémoire du drapeau** (Hugo, 2026-11-04) : éteint, l'état se garde 5 s
 * par instance et épargne l'aller-retour ; la version, elle, se relit
 * toujours. Ces tests échouent si un échec se garde, si la mémoire survit à
 * son délai, ou si un drapeau allumé saute un relevé.
 */
describe("PublicShelfCacheability — la mémoire du drapeau", () => {
  const compute = (): Promise<typeof VIEW> => Promise.resolve(VIEW);

  it("éteint : lu une fois, puis plus pendant 5 s", async () => {
    const { cacheability, shelf, clock } = publicRig();

    await cacheability.around(compute);
    clock.advanceMs(PUBLIC_FLAG_MEMORY_MS - 1);
    const reply = await cacheability.around(compute);

    expect(reply).toEqual({ view: VIEW, cacheable: false, reason: "disabled" });
    expect(shelf.reads).toBe(1);
  });

  it("éteint : relu passé 5 s, et l'allumage d'une autre instance est vu", async () => {
    const { cacheability, shelf, clock } = publicRig();
    await cacheability.around(compute);
    shelf.enabled = true;

    clock.advanceMs(PUBLIC_FLAG_MEMORY_MS);
    const reply = await cacheability.around(compute);

    expect(reply.cacheable).toBe(true);
    expect(shelf.reads).toBe(3);
  });

  it("allumé : la version est relevée avant ET après à chaque réponse, jamais gardée", async () => {
    const { cacheability, shelf } = rigWith(true);
    await cacheability.around(compute);

    const reply = await cacheability.around(() => {
      shelf.writeDuringCompute();
      return compute();
    });

    expect(shelf.reads).toBe(4);
    expect(reply.cacheable).toBe(false);
  });

  it("un objet en panne ne remplit pas la mémoire : le relevé suivant relit l'objet", async () => {
    const { cacheability, shelf } = publicRig();
    shelf.failure = "throws";
    await cacheability.around(compute);
    shelf.failure = null;
    shelf.enabled = true;

    const reply = await cacheability.around(compute);

    expect(reply.cacheable).toBe(true);
    expect(shelf.reads).toBe(3);
  });

  it("oubliée par une bascule de cette instance : relue tout de suite", async () => {
    const { cacheability, shelf, publicShelf } = publicRig();
    await cacheability.around(compute);
    shelf.enabled = true;

    publicShelf.forgetFlag();
    const reply = await cacheability.around(compute);

    expect(reply.cacheable).toBe(true);
    expect(shelf.reads).toBe(3);
  });
});
