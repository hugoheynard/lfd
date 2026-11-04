import { SHELF_BREAKER_FAILURES } from "../shelf-cache-breaker.js";
import { InMemoryPublicShelf, publicRig, type PublicShelfFailure } from "./public-shelf-doubles.js";
import { BrokenShelfCache, resilientAround } from "./shelf-cache-doubles.js";
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

    expect(reply).toEqual({ view: VIEW, cacheable: false });
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

    expect(reply).toEqual({ view: VIEW, cacheable: false });
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

      expect(reply).toEqual({ view: VIEW, cacheable: false });
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
      new ResilientPublicShelf(shelf, shelf, rig.guard, rig.signals),
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
