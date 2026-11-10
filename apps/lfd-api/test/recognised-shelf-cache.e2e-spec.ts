/**
 * E2E du **rayon reconnu gardé au magasin des rayons pro** — phase 1 de
 * `documentation/caching-usage/le-rayon-en-cache.md`, § 6.3.
 *
 * Ce que seul ce niveau prouve : la vraie route `/shop/catalogue/mine`, le vrai
 * calcul et les vraies opérations lues en base rangent le rayon, le servent au
 * second appel sans le recalculer, et lui donnent pour échéance l'instant où
 * une opération datée l'ouvre — pas le plafond de 5 minutes.
 *
 * Le magasin est la version en mémoire du port (l'objet ne tourne pas en e2e) ;
 * l'horloge est fixée à MAINTENANT, et toutes les dates d'opération en partent.
 */
import type { SyncOperation } from "@lfd/catalog-sync";

import type {
  ShelfLookup,
  ShelfKey,
  ShelfToStore,
  StoreOutcome,
} from "../src/lafoliecoffee/catalog/domain/ports/shop-shelf-cache.js";
import { ShopShelfCache } from "../src/lafoliecoffee/catalog/domain/ports/shop-shelf-cache.js";
import { InMemoryShopShelfCache } from "../src/lafoliecoffee/catalog/infrastructure/in-memory-shop-shelf-cache.js";
import { RECOGNISED_SHELF_LIFETIME_MS } from "../src/lafoliecoffee/catalog/application/recognised-shelf.service.js";
import { ShelfWindowTimer } from "../src/lafoliecoffee/shared/shelf-changes/domain/ports/shelf-window-timer.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { deliverAsFacts } from "./catalog-facts-delivery.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { prepareAtCommerce } from "./operations-at-commerce-seed.js";

const MEMBER = "auth0|recognised-shelf-cache-member";
const OPENS_IN_MS = 2 * 60_000;

/** Le magasin en mémoire, qui note ce qu'il sert et ce qu'on lui range. */
class RecordingShelfCache extends InMemoryShopShelfCache {
  readonly lookups: ShelfLookup["kind"][] = [];
  readonly stored: ShelfToStore[] = [];

  override async read(key: ShelfKey, now: Date): Promise<ShelfLookup> {
    const lookup = await super.read(key, now);
    this.lookups.push(lookup.kind);
    return lookup;
  }

  override async store(entry: ShelfToStore): Promise<StoreOutcome> {
    this.stored.push(entry);
    return super.store(entry);
  }
}

/** La fenêtre de purge sans attente : une purge part tout de suite après le commit. */
class ImmediateWindowTimer extends ShelfWindowTimer {
  after(_delayMs: number, callback: () => void): void {
    callback();
  }
}

const clock = new FixedClock(new Date());
const cache = new RecordingShelfCache();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: ShopShelfCache, value: cache },
      { token: Clock, value: clock },
      { token: ShelfWindowTimer, value: new ImmediateWindowTimer() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(new Date());
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  await deliverAsFacts(ctx, snapshotOf([{ sku: "VIE-001", priceMillicents: 210_000 }]));
  // Les purges que le semis a déclenchées sont passées : on part d'un magasin vide.
  await new Promise((resolve) => setImmediate(resolve));
  await cache.erase({ kind: "all" });
  cache.lookups.length = 0;
  cache.stored.length = 0;
});

/** Une opération annoncée dans 2 minutes, commandable dès l'annonce. */
function galette(): SyncOperation {
  const now = clock.now().getTime();
  return {
    key: "galette",
    name: { fr: "Galette" },
    lede: null,
    image: null,
    announceFrom: new Date(now + OPENS_IN_MS).toISOString(),
    orderFrom: null,
    orderUntil: new Date(now + 10 * OPENS_IN_MS).toISOString(),
    pickupFrom: serviceDay(5),
    pickupUntil: serviceDay(6),
    audience: "both",
    skus: [],
  };
}

const readShelf = async (): Promise<void> => {
  await ctx.asSub(MEMBER).get("/shop/catalogue/mine").expect(200);
};

describe("le rayon reconnu au magasin des rayons pro", () => {
  it("est servi par le magasin au second appel, rangé jusqu'au plafond", async () => {
    await readShelf();
    await readShelf();

    expect(cache.lookups).toEqual(["miss", "hit"]);
    expect(cache.stored.map((entry) => entry.expiresAt.getTime())).toEqual([
      clock.now().getTime() + RECOGNISED_SHELF_LIFETIME_MS,
    ]);
  });

  it("expire à l'heure où une opération datée l'ouvre, pas au plafond", async () => {
    await prepareAtCommerce(ctx, galette());
    await new Promise((resolve) => setImmediate(resolve));
    cache.lookups.length = 0;
    const opensAt = clock.now().getTime() + OPENS_IN_MS;

    await readShelf();
    expect(cache.stored.map((entry) => entry.expiresAt.getTime())).toEqual([opensAt]);

    clock.advanceMs(OPENS_IN_MS - 1);
    await readShelf();
    clock.advanceMs(1);
    await readShelf();

    expect(cache.lookups).toEqual(["miss", "hit", "miss"]);
  });
});
