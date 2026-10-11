import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ShopCopyLocale } from "../../domain/shop-copy-locale.js";
import {
  CachedPublishedShopCopyReader,
  VERSION_RECHECK_MS,
} from "../cached-published-shop-copy.reader.js";
import { PublishedShopCopyStore } from "../published-shop-copy.store.js";

/** Un magasin qui compte ses lectures — ce que le cache doit épargner. */
class CountingStore extends PublishedShopCopyStore {
  versionReads = 0;
  textReads = 0;
  current = 1;
  texts_: Record<string, string> = { "cart.title": "Mon panier" };

  version(): Promise<number> {
    this.versionReads += 1;
    return Promise.resolve(this.current);
  }

  texts(locale: ShopCopyLocale): Promise<Readonly<Record<string, string>>> {
    this.textReads += 1;
    return Promise.resolve(locale === "fr" ? { ...this.texts_ } : {});
  }
}

function setup(): {
  store: CountingStore;
  clock: FixedClock;
  cache: CachedPublishedShopCopyReader;
} {
  const store = new CountingStore();
  const clock = new FixedClock(new Date(0));
  return { store, clock, cache: new CachedPublishedShopCopyReader(store, clock) };
}

describe("les textes publiés, gardés en mémoire", () => {
  it("froid : la version puis les textes ; chaud : aucune lecture", async () => {
    const { store, cache } = setup();
    await cache.read("fr");
    expect([store.versionReads, store.textReads]).toEqual([1, 1]);

    expect(await cache.read("fr")).toEqual({ version: 1, texts: { "cart.title": "Mon panier" } });
    expect([store.versionReads, store.textReads]).toEqual([1, 1]);
  });

  it("tiède : passé le délai, une seule lecture — la version — si rien n'a bougé", async () => {
    const { store, clock, cache } = setup();
    await cache.read("fr");
    clock.advanceMs(VERSION_RECHECK_MS);
    await cache.read("fr");
    expect([store.versionReads, store.textReads]).toEqual([2, 1]);
  });

  it("une publication faite AILLEURS se voit au plus tard après le délai", async () => {
    const { store, clock, cache } = setup();
    await cache.read("fr");
    store.current = 2;
    store.texts_ = { "cart.title": "Votre panier" };

    expect((await cache.read("fr")).version).toBe(1);
    clock.advanceMs(VERSION_RECHECK_MS);
    expect(await cache.read("fr")).toEqual({
      version: 2,
      texts: { "cart.title": "Votre panier" },
    });
  });

  it("une publication faite ICI se voit tout de suite après `forget()`", async () => {
    const { store, cache } = setup();
    await cache.read("fr");
    store.current = 2;
    cache.forget();
    expect((await cache.read("fr")).version).toBe(2);
  });

  it("garde chaque langue à part, sous la même version", async () => {
    const { store, cache } = setup();
    await cache.read("fr");
    await cache.read("en");
    await cache.read("en");
    expect([store.versionReads, store.textReads]).toEqual([1, 2]);
  });

  it("des lectures simultanées partagent une seule relecture de la version", async () => {
    const { store, cache } = setup();
    await Promise.all([cache.read("fr"), cache.read("fr"), cache.read("it")]);
    expect(store.versionReads).toBe(1);
  });
});
