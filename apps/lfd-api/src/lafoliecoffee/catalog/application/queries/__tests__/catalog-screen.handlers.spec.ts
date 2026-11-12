import type {
  ArticleReservationView,
  CatalogScreenItemView,
  CompanyReservedArticlesView,
  MadeToOrderMarkView,
  StaffPermission,
} from "@lfd/contracts";

import { ScriptedCallDeadline } from "../../../../../platform/cache-calls/__tests__/cache-call-doubles.js";
import { VersionedContentCache } from "../../../../../platform/day-versions/versioned-content-cache.js";
import { VersionedContents } from "../../../../../platform/day-versions/versioned-contents.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../../../../platform/time/fixed-wall-clock.js";
import { CatalogAdminChangeVersionReader } from "../../../domain/ports/catalog-admin-change-version.reader.js";
import {
  CatalogScreenReader,
  type CatalogScreenSource,
} from "../../../domain/ports/catalog-screen.reader.js";
import { MadeToOrderAdminReader } from "../../../domain/ports/made-to-order-admin.reader.js";
import type { PublishedItemRow } from "../../../domain/ports/published-catalog.reader.js";
import { GetCatalogScreenRowsHandler } from "../get-catalog-screen-rows.handler.js";
import { GetCatalogScreenRowsQuery } from "../get-catalog-screen-rows.query.js";
import { GetCatalogScreenHandler } from "../get-catalog-screen.handler.js";
import { GetCatalogScreenQuery } from "../get-catalog-screen.query.js";

/**
 * L'écran Catalogue (`le-cache-du-back-office.md`, § 4.1–4.2) : le
 * numéro lu AVANT les données, le sur mesure sous son seul droit, les lignes
 * recomposées sans comptes. Les dates ne sont comparées à aucune horloge.
 */

const RECEIVED = new Date("2026-10-01T08:00:00.000Z");

class OrderedLog {
  readonly calls: string[] = [];
}

class LoggedVersions extends CatalogAdminChangeVersionReader {
  constructor(private readonly log: OrderedLog) {
    super();
  }
  versionOf(): Promise<number> {
    this.log.calls.push("version");
    return Promise.resolve(42);
  }
}

function item(over: Partial<PublishedItemRow> = {}): PublishedItemRow {
  return {
    sku: "VIE-1-1",
    productId: "p1",
    productSku: "VIE-1",
    name: "Croissant",
    categoryId: "fam",
    isDefault: true,
    saleUnit: "piece",
    position: 0,
    audience: "both",
    publicReviewPending: true,
    proReviewPending: false,
    isHidden: false,
    isHiddenPublic: false,
    proHtMillicents: 120_000,
    vatRatePercent: 5.5,
    publicTtcCents: 180,
    receivedAt: RECEIVED,
    ...over,
  };
}

const SCREEN_ITEM = { sku: "VIE-1-1", productId: "p1" } as const;

function source(): CatalogScreenSource {
  return {
    published: {
      entries: [],
      items: [item()],
      families: [
        {
          id: "fam",
          name: "Viennoiseries",
          parentId: null,
          position: 1,
          audience: null,
          withdrawn: false,
        },
      ],
    },
    items: [screenItem()],
  };
}

function screenItem(): CatalogScreenItemView {
  return {
    ...SCREEN_ITEM,
    productSku: "VIE-1",
    name: "Croissant",
    categoryId: "fam",
    categoryName: "Viennoiseries",
    pimPriceMillicents: 120_000,
    publicTtcCents: 180,
    publicVatRatePercent: 5.5,
    vatRatePercent: 5.5,
    allergens: [],
    allergensIncomplete: false,
    isHidden: false,
    isHiddenPublic: false,
    audience: "both",
    publicReviewPending: true,
    proReviewPending: false,
    isFeaturedPro: false,
    isFeaturedPublic: false,
    isCustomRecipe: false,
    operationOnly: false,
    decidedAt: null,
    receivedAt: RECEIVED.toISOString(),
  };
}

class LoggedScreen extends CatalogScreenReader {
  readonly asked: (readonly string[])[] = [];
  constructor(private readonly log: OrderedLog) {
    super();
  }
  read(): Promise<CatalogScreenSource> {
    this.log.calls.push("screen");
    return Promise.resolve(source());
  }
  readProductsOf(skus: readonly string[]): Promise<CatalogScreenSource> {
    this.log.calls.push("rows");
    this.asked.push(skus);
    return Promise.resolve(source());
  }
}

class CountingMadeToOrder extends MadeToOrderAdminReader {
  asked = 0;
  marks(): Promise<MadeToOrderMarkView[]> {
    this.asked += 1;
    return Promise.resolve([
      { sku: "VIE-1-1", isCustomRecipe: true, reservedVisibility: "hidden", reservationCount: 2 },
    ]);
  }
  ofArticle(): Promise<ArticleReservationView | null> {
    return Promise.resolve(null);
  }
  ofCompany(): Promise<CompanyReservedArticlesView | null> {
    return Promise.resolve(null);
  }
}

/** L'objet, en mémoire : la charge rangée au dernier numéro. */
class MemoryContents extends VersionedContentCache {
  private kept: { version: number; body: string } | null = null;
  read(_key: string, version: number): Promise<string | null> {
    return Promise.resolve(this.kept?.version === version ? this.kept.body : null);
  }
  store(_key: string, version: number, body: string): Promise<void> {
    this.kept = { version, body };
    return Promise.resolve();
  }
}

function contentsAround(): VersionedContents {
  return new VersionedContents(
    new MemoryContents(),
    new ScriptedCallDeadline(),
    new FixedWallClock(new Date(Date.UTC(2030, 0, 1))),
    new FixedStopwatch(3),
    new RecordingTimings(),
  );
}

/** Le rangement part après la réponse : laisser passer ses micro-tâches. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

function screenAround() {
  const log = new OrderedLog();
  const screen = new LoggedScreen(log);
  const madeToOrder = new CountingMadeToOrder();
  const handler = new GetCatalogScreenHandler(
    new LoggedVersions(log),
    screen,
    madeToOrder,
    contentsAround(),
  );
  const rows = new GetCatalogScreenRowsHandler(new LoggedVersions(log), screen);
  return { log, screen, madeToOrder, handler, rows };
}

const CATALOG_ONLY: readonly StaffPermission[] = ["lfc_catalog:read"];

describe("GetCatalogScreenHandler", () => {
  it("lit le numéro AVANT les données, et le rend avec elles", async () => {
    const { log, handler } = screenAround();

    const view = await handler.execute(new GetCatalogScreenQuery(CATALOG_ONLY));

    expect(log.calls).toEqual(["version", "screen"]);
    expect(view.version).toBe(42);
    expect(view.items).toEqual([screenItem()]);
  });

  it("compose la vue publiée par l'arithmétique partagée : rayons comptés, liste à valider", async () => {
    const { handler } = screenAround();

    const view = await handler.execute(new GetCatalogScreenQuery(CATALOG_ONLY));

    expect(view.published.shelves.map((shelf) => shelf.categoryId)).toEqual(["fam"]);
    expect(view.published.pendingReview).toEqual([
      expect.objectContaining({ sku: "VIE-1-1", audiences: ["public"] }),
    ]);
  });

  it("🔴 sans `lfc_made_to_order:read`, les marqueurs du sur mesure sont absents et pas lus", async () => {
    const { handler, madeToOrder } = screenAround();

    const view = await handler.execute(new GetCatalogScreenQuery(CATALOG_ONLY));

    expect(view.madeToOrder).toBeNull();
    expect(madeToOrder.asked).toBe(0);
  });

  it("avec `lfc_made_to_order:read`, les marqueurs en sont", async () => {
    const { handler, madeToOrder } = screenAround();

    const view = await handler.execute(
      new GetCatalogScreenQuery(["lfc_catalog:read", "lfc_made_to_order:read"]),
    );

    expect(view.madeToOrder).toEqual([expect.objectContaining({ sku: "VIE-1-1" })]);
    expect(madeToOrder.asked).toBe(1);
  });
});

describe("GetCatalogScreenHandler — servi depuis l'objet", () => {
  it("au même numéro, le second appel ne relit pas la base", async () => {
    const { log, handler } = screenAround();
    const first = await handler.execute(new GetCatalogScreenQuery(CATALOG_ONLY));
    await settle();

    const second = await handler.execute(new GetCatalogScreenQuery(CATALOG_ONLY));

    expect(log.calls).toEqual(["version", "screen", "version"]);
    expect(second).toEqual(first);
  });

  it("🔴 les marqueurs du sur mesure ne sont jamais rangés : lus à chaque appel, sous leur droit", async () => {
    const { handler, madeToOrder } = screenAround();
    const ALL: readonly StaffPermission[] = ["lfc_catalog:read", "lfc_made_to_order:read"];
    await handler.execute(new GetCatalogScreenQuery(ALL));
    await settle();

    const without = await handler.execute(new GetCatalogScreenQuery(CATALOG_ONLY));
    const withRight = await handler.execute(new GetCatalogScreenQuery(ALL));

    expect(without.madeToOrder).toBeNull();
    expect(withRight.madeToOrder).toHaveLength(1);
    expect(madeToOrder.asked).toBe(2);
  });
});

describe("GetCatalogScreenRowsHandler", () => {
  it("lit le numéro AVANT les lignes, et rend les fiches sans comptes", async () => {
    const { log, screen, rows } = screenAround();

    const view = await rows.execute(new GetCatalogScreenRowsQuery(["VIE-1-1"]));

    expect(log.calls).toEqual(["version", "rows"]);
    expect(screen.asked).toEqual([["VIE-1-1"]]);
    expect(view.version).toBe(42);
    expect(view.entries.map((entry) => entry.productId)).toEqual(["p1"]);
    expect(view.items).toEqual([screenItem()]);
    expect(Object.keys(view).sort()).toEqual(["entries", "items", "version"]);
  });
});
