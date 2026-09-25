import type { CatalogAdminItemView } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { receivedNoel } from "../../../catalog/application/commands/__tests__/operation-doubles.js";
import { CatalogAdminReader } from "../../../catalog/domain/ports/catalog-admin.reader.js";
import {
  ReceivedOperationsReader,
  type ReceivedOperation,
} from "../../../catalog/domain/ports/received-operations.reader.js";
import { CatalogBackedStorefrontCatalogReader } from "../../infrastructure/catalog-backed-storefront-catalog.reader.js";
import { GetStorefrontCatalogHandler } from "../get-storefront-catalog.handler.js";

/** Le catalogue d'administration, tel que `b2b/catalog` le rend. */
class ListedCatalog extends CatalogAdminReader {
  constructor(private readonly lines: CatalogAdminItemView[]) {
    super();
  }

  list(): Promise<CatalogAdminItemView[]> {
    return Promise.resolve(this.lines);
  }
}

/** Les opérations reçues, telles que `b2b/catalog` les rend. */
class ListedOperations extends ReceivedOperationsReader {
  constructor(private readonly operations: readonly ReceivedOperation[]) {
    super();
  }

  list(): Promise<readonly ReceivedOperation[]> {
    return Promise.resolve(this.operations);
  }
}

const DAY_MS = 86_400_000;

/** Noël reçu ; l'horloge se pose RELATIVEMENT à ses dates, jamais au calendrier. */
const NOEL = receivedNoel();
const DURING_ANNOUNCE = new Date(NOEL.announceFrom.getTime() + DAY_MS);

/** Une ligne du catalogue ; `receivedAt` n'est jamais comparé à l'horloge. */
function line(overrides: Partial<CatalogAdminItemView>): CatalogAdminItemView {
  return {
    sku: "PAI-001-1",
    productSku: "PAI-001",
    name: "Baguette",
    categoryId: "bread",
    categoryName: "Pains",
    pimPriceMillicents: 100_000,
    b2bPriceMillicents: 90_000,
    effectivePriceMillicents: 90_000,
    publicTtcCents: 120,
    publicVatRatePercent: 5.5,
    decidedPublicTtcCents: null,
    vatRatePercent: 5.5,
    allergens: null,
    allergensIncomplete: false,
    isHidden: false,
    isHiddenPublic: false,
    isFeatured: false,
    operationOnly: false,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    receivedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function handlerOver(
  lines: CatalogAdminItemView[],
  operations: readonly ReceivedOperation[] = [],
  now: Date = DURING_ANNOUNCE,
): GetStorefrontCatalogHandler {
  return new GetStorefrontCatalogHandler(
    new CatalogBackedStorefrontCatalogReader(
      new ListedCatalog(lines),
      new ListedOperations(operations),
      new FixedClock(now),
    ),
  );
}

function received(over: Partial<ReceivedOperation> = {}): ReceivedOperation {
  return { received: NOEL, withdrawnAt: null, override: null, ...over };
}

describe("GetStorefrontCatalogHandler", () => {
  it("rend le SKU du PRODUIT, une fois, et rien du prix ni des réglages", async () => {
    const view = await handlerOver([
      line({ sku: "PAI-001-1" }),
      line({ sku: "PAI-001-2", name: "Baguette (grande)" }),
    ]).execute();

    expect(view).toEqual({
      shelves: [{ key: "bread", name: "Pains", operation: false }],
      items: [{ sku: "PAI-001", name: "Baguette", shelfKey: "bread", served: true }],
      operations: [],
    });
  });

  it("un article masqué des DEUX boutiques n'est pas servi, et ne fait pas son rayon", async () => {
    const view = await handlerOver([
      line({}),
      line({
        sku: "VIE-001-1",
        productSku: "VIE-001",
        name: "Croissant",
        categoryId: "pastry",
        categoryName: "Viennoiseries",
        isHidden: true,
        isHiddenPublic: true,
      }),
    ]).execute();

    expect(view.shelves).toEqual([{ key: "bread", name: "Pains", operation: false }]);
    expect(view.items).toContainEqual({
      sku: "VIE-001",
      name: "Croissant",
      shelfKey: "pastry",
      served: false,
    });
  });

  it("masqué d'une seule boutique, il reste servi", async () => {
    const view = await handlerOver([
      line({ isHidden: true }),
      line({ sku: "X-1", productSku: "X", isHiddenPublic: true }),
    ]).execute();

    expect(view.items.map((item) => item.served)).toEqual([true, true]);
  });

  it("un produit est servi si UNE de ses déclinaisons l'est, sous le nom de celle-là", async () => {
    const view = await handlerOver([
      line({ sku: "PAI-001-1", name: "Masquée", isHidden: true, isHiddenPublic: true }),
      line({ sku: "PAI-001-2", name: "Servie" }),
    ]).execute();

    expect(view.items).toEqual([
      { sku: "PAI-001", name: "Servie", shelfKey: "bread", served: true },
    ]);
  });

  it("les rayons suivent l'ordre du catalogue", async () => {
    const view = await handlerOver([
      line({ productSku: "A", categoryId: "pastry", categoryName: "Viennoiseries" }),
      line({ productSku: "B" }),
      line({ productSku: "C", categoryId: "pastry", categoryName: "Viennoiseries" }),
    ]).execute();

    expect(view.shelves.map((shelf) => shelf.key)).toEqual(["pastry", "bread"]);
  });

  it("propose le rayon op:<key> de chaque opération reçue, en tête, nommé en français", async () => {
    const view = await handlerOver([line({})], [received()]).execute();

    expect(view.shelves).toEqual([
      { key: "op:noel-2026", name: "Noël", operation: true },
      { key: "bread", name: "Pains", operation: false },
    ]);
    expect(view.operations).toEqual([
      {
        key: "noel-2026",
        name: { fr: "Noël", en: "Christmas" },
        lede: null,
        image: null,
        // Sans `orderFrom`, la commande ouvre dès l'annonce (D2).
        state: "open",
        announceFrom: NOEL.announceFrom.toISOString(),
        orderFrom: NOEL.announceFrom.toISOString(),
        orderUntil: NOEL.orderUntil.toISOString(),
        pickupFrom: "2026-12-20",
        pickupUntil: "2026-12-24",
      },
    ]);
  });

  it("ne propose pas une opération retirée", async () => {
    const view = await handlerOver(
      [line({})],
      [received({ withdrawnAt: NOEL.receivedAt })],
    ).execute();

    expect(view.operations).toEqual([]);
    expect(view.shelves.map((shelf) => shelf.key)).toEqual(["bread"]);
  });

  it("dit l'état de l'opération à l'horloge du serveur, et la clôture effective", async () => {
    const earlier = new Date(NOEL.orderUntil.getTime() - DAY_MS);
    const hidden = received({
      override: {
        operationKey: "noel-2026",
        restriction: { isHidden: true, orderUntil: earlier, audience: null, hiddenSkus: [] },
        decidedBy: "staff_1",
        decidedAt: NOEL.receivedAt,
      },
    });
    const before = new Date(NOEL.announceFrom.getTime() - DAY_MS);
    const after = new Date(NOEL.orderUntil.getTime() + 30 * DAY_MS);

    const stateAt = async (operation: ReceivedOperation, now: Date) =>
      (await handlerOver([], [operation], now).execute()).operations[0];

    expect((await stateAt(received(), before))?.state).toBe("preparing");
    expect((await stateAt(received(), after))?.state).toBe("ended");
    expect(await stateAt(hidden, DURING_ANNOUNCE)).toMatchObject({
      state: "hidden",
      orderUntil: earlier.toISOString(),
    });
  });
});
