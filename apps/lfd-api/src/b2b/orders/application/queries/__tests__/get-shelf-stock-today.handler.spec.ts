import type { CatalogViewer } from "../../../../catalog/domain/catalog-viewer.js";
import { CatalogViewers } from "../../../../catalog/application/catalog-viewers.service.js";
import { VIENNOISERIES } from "../../../../catalog/domain/__tests__/families.fixture.js";
import {
  type CatalogItem,
  ProductCatalogReader,
  type UnsealedCatalogItem,
} from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { InMemoryServedCompanies } from "../../../../catalog/infrastructure/in-memory-served-companies.js";
import type { SameDayCircuitSettings } from "../../../domain/ports/same-day-order.reader.js";
import {
  FixedClosedPlans,
  FixedSameDay,
  gateOf,
} from "../../../application/commands/__tests__/plan-doubles.js";
import {
  FixedShelfStock,
  FixedSiteDays,
  shelfCircuitOf,
  siteDay,
} from "../../../application/services/__tests__/shelf-circuit-doubles.js";
import { GetShelfStockTodayHandler } from "../get-shelf-stock-today.handler.js";
import { GetShelfStockTodayQuery, type ShelfStockCaller } from "../get-shelf-stock-today.query.js";

/**
 * Le reste d'aujourd'hui servi à la boutique (plan du jour J, lot L7b). La
 * porte du plan de `gateOf` est le 1er janvier 2026 à midi, Paris : `TODAY`
 * n'est comparé qu'à cette horloge figée (exception étroite du CLAUDE.md §5).
 */

const TODAY = "2026-01-01";
const SITE = "site_village";
const SITE_DAY = siteDay({
  proPickup: { start: "06:00", end: "18:00" },
  publicRules: [{ start: "16:00", end: "17:00", slotMinutes: 60 }],
});

/** Un point dont la fenêtre pro et les créneaux publics sont passés à midi. */
const SITE_OVER = "site_over";

const article = (sku: string, extra: Partial<UnsealedCatalogItem> = {}): UnsealedCatalogItem => ({
  sku,
  name: sku,
  unitPriceMillicents: 220_000,
  vatRate: 5.5,
  family: VIENNOISERIES,
  allergens: null,
  orderTimeLimit: null,
  ...extra,
});

/** Le catalogue de l'appelant : note chaque lecteur, sert ce que le test déclare. */
class ViewerCatalog extends ProductCatalogReader {
  readonly viewers: CatalogViewer[] = [];
  private readonly items: InMemoryProductCatalog;

  constructor(items: readonly UnsealedCatalogItem[]) {
    super();
    this.items = new InMemoryProductCatalog(items);
  }

  resolve(sku: string): Promise<CatalogItem | null> {
    return this.items.resolve(sku);
  }

  all(): Promise<readonly CatalogItem[]> {
    return this.items.all();
  }

  resolveMany(
    skus: readonly string[],
    viewer: CatalogViewer,
  ): Promise<ReadonlyMap<string, CatalogItem>> {
    this.viewers.push(viewer);
    return this.items.resolveMany(skus);
  }
}

interface Setup {
  readonly closed?: readonly string[];
  readonly sameDay?: boolean | Partial<SameDayCircuitSettings>;
}

function handlerOf({ closed = [TODAY], sameDay = true }: Setup = {}) {
  const lines = [
    {
      sku: "VIE-001",
      label: "Croissant",
      saleUnit: "piece",
      receivedQuantity: 10,
      estimatedStock: 3,
    },
    {
      sku: "PAI-010",
      label: "Campagne",
      saleUnit: "weight",
      receivedQuantity: 3000,
      estimatedStock: 1200,
    },
    {
      sku: "SUR-001",
      label: "Sur mesure",
      saleUnit: "piece",
      receivedQuantity: 4,
      estimatedStock: 4,
    },
    {
      sku: "VIE-002",
      label: "Pain au chocolat",
      saleUnit: "piece",
      receivedQuantity: 5,
      estimatedStock: 0,
    },
  ] as const;
  const stock = new FixedShelfStock().set(TODAY, SITE, lines).set(TODAY, SITE_OVER, lines);
  const catalog = new ViewerCatalog([
    article("VIE-001"),
    article("VIE-002"),
    article("PAI-010", { saleUnit: "weight", weightMinGrams: 250, weightStepGrams: 50 }),
    // SUR-001 : sur mesure non attribué, que le catalogue de l'appelant tait.
  ]);
  const plans = gateOf(new FixedClosedPlans(closed));
  const circuit = shelfCircuitOf(plans, {
    sameDay: new FixedSameDay(sameDay),
    sites: new FixedSiteDays(
      new Map([
        [SITE, SITE_DAY],
        [
          SITE_OVER,
          siteDay({
            proPickup: { start: "06:00", end: "09:00" },
            publicRules: [{ start: "08:00", end: "09:00", slotMinutes: 60 }],
          }),
        ],
      ]),
    ),
    stock,
  });
  const handler = new GetShelfStockTodayHandler(
    plans,
    circuit,
    stock,
    catalog,
    new CatalogViewers(new InMemoryServedCompanies()),
  );
  const read = (caller: ShelfStockCaller, site = SITE) =>
    handler.execute(new GetShelfStockTodayQuery(site, caller));
  return { read, catalog };
}

const PRO_ANONYMOUS: ShelfStockCaller = { kind: "anonymous", audience: "pro" };
const PUBLIC: ShelfStockCaller = { kind: "anonymous", audience: "public" };

describe("GetShelfStockTodayHandler — la vitrine d'aujourd'hui pour la boutique", () => {
  it("rend le reste des articles servis, grammes au poids, sans reste nul ni sur mesure", async () => {
    const { read } = handlerOf();

    expect(await read(PRO_ANONYMOUS)).toEqual([
      { sku: "VIE-001", saleUnit: "piece", left: 3 },
      { sku: "PAI-010", saleUnit: "weight", left: 1200 },
    ]);
  });

  it("plan d'aujourd'hui non arrêté : vide, aujourd'hui se fabrique encore", async () => {
    const { read, catalog } = handlerOf({ closed: [] });

    expect(await read(PRO_ANONYMOUS)).toEqual([]);
    expect(catalog.viewers).toEqual([]);
  });

  it("particulier quand seuls les pros sont ouverts : vide", async () => {
    const { read } = handlerOf({
      sameDay: { sameDayProAllowed: true, sameDayProOnline: true, sameDayPublicAllowed: false },
    });

    expect(await read(PUBLIC)).toEqual([]);
    expect(await read({ kind: "acting", companyId: null })).toEqual([]);
    expect(await read(PRO_ANONYMOUS)).not.toEqual([]);
  });

  it("plus de créneau au point, ou point inconnu : vide", async () => {
    const { read } = handlerOf();

    expect(await read(PRO_ANONYMOUS, SITE_OVER)).toEqual([]);
    expect(await read(PUBLIC, SITE_OVER)).toEqual([]);
    expect(await read(PRO_ANONYMOUS, "site_inconnu")).toEqual([]);
  });

  it("le client reconnu : le serveur décide son lecteur depuis sa société", async () => {
    const { read, catalog } = handlerOf();

    await read({ kind: "acting", companyId: "co_1" });
    await read({ kind: "acting", companyId: null });

    expect(catalog.viewers.map((viewer) => viewer.kind)).toEqual(["pro", "public"]);
  });

  it("l'anonyme lit le rayon pro anonyme, jamais celui d'une société", async () => {
    const { read, catalog } = handlerOf();

    await read(PRO_ANONYMOUS);
    await read(PUBLIC);

    expect(catalog.viewers.map((viewer) => viewer.kind)).toEqual(["pro_anonymous", "public"]);
  });
});
