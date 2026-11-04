import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ShelfKey, ShelfLookup } from "../../domain/ports/shop-shelf-cache.js";
import { InMemoryShopShelfCache } from "../../infrastructure/in-memory-shop-shelf-cache.js";
import { NoShopShelfCache } from "../../infrastructure/no-shop-shelf-cache.js";
import { RECOGNISED_SHELF_LIFETIME_MS, RecognisedShelf } from "../recognised-shelf.service.js";
import { BrokenShelfCache, resilientAround, type ShelfFailure } from "./shelf-cache-doubles.js";
import {
  HEAD,
  OTHER,
  PENDING_HEAD,
  SHELF_NOW,
  shelfComputation,
  SITE,
  SITE_OF_PENDING,
  type ShelfComputation,
} from "./recognised-shelf-fixture.js";

/**
 * **Le rayon reconnu à travers le magasin des rayons pro** (C2,
 * `plan-cache-du-catalogue.md`) — contre le VRAI calcul du rayon et la
 * version en mémoire du port (§ 4 ter), jamais contre l'objet.
 */
interface Rig {
  readonly shelf: RecognisedShelf;
  readonly computation: ShelfComputation;
  readonly clock: FixedClock;
}

function rig(cache: InMemoryShopShelfCache | NoShopShelfCache | BrokenShelfCache): Rig {
  const computation = shelfComputation();
  const clock = new FixedClock(SHELF_NOW);
  const { resilient } = resilientAround(cache);
  return { shelf: new RecognisedShelf(computation.pricing, resilient, clock), computation, clock };
}

/** Le rayon tel que la route le servait avant C2 : le calcul seul. */
async function uncached(key: ShelfKey) {
  return await shelfComputation().pricing.priced(key, "registered", "fr");
}

/** Un magasin où une purge tombe pendant chaque calcul : la version a bougé au rangement. */
class PurgedDuringCompute extends InMemoryShopShelfCache {
  readonly order: string[] = [];

  constructor(private readonly computation: () => ShelfComputation) {
    super();
  }

  override async read(key: ShelfKey, now: Date): Promise<ShelfLookup> {
    this.order.push(`read:catalog-reads=${this.computation().catalog.reads}`);
    const lookup = await super.read(key, now);
    await this.erase({ kind: "all" });
    return lookup;
  }
}

describe("RecognisedShelf — le rayon pro passé par le magasin", () => {
  it("à chaud, ne relit ni le catalogue ni la société : le budget baisse", async () => {
    const { shelf, computation } = rig(new InMemoryShopShelfCache());

    const cold = await shelf.read(HEAD);
    const coldReads = [computation.catalog.reads, computation.companies.asked.length];
    const hot = await shelf.read(HEAD);

    expect(hot).toEqual(cold);
    expect(coldReads).toEqual([1, 1]);
    expect([computation.catalog.reads, computation.companies.asked.length]).toEqual(coldReads);
  });

  it("sert STRICTEMENT le rayon d'avant le cache, froid comme chaud", async () => {
    const baseline = await uncached(HEAD);
    const { shelf } = rig(new InMemoryShopShelfCache());

    expect(await shelf.read(HEAD)).toEqual(baseline);
    expect(await shelf.read(HEAD)).toEqual(baseline);
  });

  it("sans magasin (dev local, e2e) : le rayon d'avant, calculé à chaque fois", async () => {
    const baseline = await uncached(SITE);
    const { shelf, computation } = rig(new NoShopShelfCache());

    expect(await shelf.read(SITE)).toEqual(baseline);
    expect(await shelf.read(SITE)).toEqual(baseline);
    expect(computation.catalog.reads).toBe(2);
  });

  it.each<[ShelfFailure]>([["throws"], ["unreadable"], ["hangs"]])(
    "un magasin qui %s : le même rayon, calculé depuis la base",
    async (failure) => {
      const baseline = await uncached(HEAD);
      const computation = shelfComputation();
      const cache = new BrokenShelfCache(failure);
      const { resilient, deadline } = resilientAround(cache);
      deadline.late = failure === "hangs";
      const shelf = new RecognisedShelf(computation.pricing, resilient, new FixedClock(SHELF_NOW));

      expect(await shelf.read(HEAD)).toEqual(baseline);
      // Un magasin indisponible à la lecture : rien n'est présenté au rangement.
      expect(cache.calls).toBe(1);
    },
  );

  it("relève la version AVANT de calculer, et un rayon calculé pendant une purge n'est pas gardé", async () => {
    let computation = shelfComputation();
    const cache = new PurgedDuringCompute(() => computation);
    const built = rig(cache);
    computation = built.computation;

    await built.shelf.read(HEAD);

    expect(cache.order).toEqual(["read:catalog-reads=0"]);
    expect(cache.keys()).toEqual([]);
  });

  it("ne sert jamais le rayon d'une société à une autre", async () => {
    const { shelf } = rig(new InMemoryShopShelfCache());

    await shelf.read(HEAD);
    const other = await shelf.read(OTHER);

    expect(other).toEqual(await uncached(OTHER));
    expect(other).not.toEqual(await uncached(HEAD));
  });

  it("l'espace perso a sa propre entrée", async () => {
    const cache = new InMemoryShopShelfCache();
    const { shelf } = rig(cache);

    expect(await shelf.read(null)).toEqual(await uncached(null));
    await shelf.read(HEAD);

    expect(cache.keys()).toEqual([null, HEAD]);
  });

  it("une purge d'une société efface aussi ses sites — principal actif ou non", async () => {
    const cache = new InMemoryShopShelfCache();
    const { shelf } = rig(cache);
    for (const key of [HEAD, SITE, OTHER, SITE_OF_PENDING]) {
      await shelf.read(key);
    }

    await cache.erase({ kind: "companies", companyIds: [HEAD, PENDING_HEAD] });

    expect(cache.keys()).toEqual([OTHER]);
  });

  it("une purge de tout efface tout, espace perso compris", async () => {
    const cache = new InMemoryShopShelfCache();
    const { shelf } = rig(cache);
    await shelf.read(HEAD);
    await shelf.read(null);

    await cache.erase({ kind: "all" });

    expect(cache.keys()).toEqual([]);
  });

  it("un rayon rangé vit 30 secondes sur le `Clock`, pas une de plus", async () => {
    const { shelf, computation, clock } = rig(new InMemoryShopShelfCache());
    await shelf.read(HEAD);

    clock.advanceMs(RECOGNISED_SHELF_LIFETIME_MS - 1);
    await shelf.read(HEAD);
    expect(computation.catalog.reads).toBe(1);

    clock.advanceMs(1);
    await shelf.read(HEAD);
    expect(computation.catalog.reads).toBe(2);
  });
});
