import type { PriceGridExportPayload } from "@lfd/contracts";
import { ttcCentsFromHtMillicents } from "@lfd/money";

import { CSV_BOM } from "../../../../../platform/csv/csv-cells.js";
import { FixedLineClassifications } from "../../../../orders/domain/ports/__tests__/line-classification-doubles.js";
import { linePromotionSupply } from "../../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import type { LivePromotionOverrides } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import {
  PriceGridCompanyNotFoundError,
  PriceGridDatedPublicError,
  PriceGridPickupNotFoundError,
  PriceGridPromotionNotApplicableError,
} from "../../../domain/errors/price-grid-errors.js";
import {
  COMPANY,
  GivenShelf,
  gridServices,
  mercurialeOn,
  PICKUP,
  realPricer,
  RecordingMercuriales,
  shelfArticle,
} from "../../__tests__/price-grid.doubles.js";
import { ExportPriceGridHandler } from "../export-price-grid.handler.js";
import { ExportPriceGridQuery } from "../export-price-grid.query.js";

/**
 * **La grille de prix d'un public** (`plan-export-grille-de-prix.md`, § 5),
 * montée sur la VRAIE porte du prix doublée à ses ports. Les dates ne sont
 * comparées qu'à l'horloge figée `NOW` (exception du § 5 de `CLAUDE.md`).
 */

const NOW = new Date("2030-01-15T09:00:00.000Z");
const TODAY = "2030-01-15";
const YESTERDAY = "2030-01-14";
const NEXT_MONTH = "2030-02-15";

const CROISSANT = "VIE-001-1";
const PAIN = "PAI-001-1";
const PRICES = new Map([
  [CROISSANT, 150_000],
  [PAIN, 300_000],
]);

const AT_PICKUP = { kind: "basket", pickup: "all", delivery: "none" } as const;

function basketPromotion(id: string, overrides: LivePromotionOverrides = {}): LivePromotion {
  return livePromotion({ id, label: `Panier ${id}`, fulfillment: AT_PICKUP, ...overrides });
}

interface World {
  readonly lines?: readonly LivePromotion[];
  readonly basket?: readonly LivePromotion[];
  readonly mercuriales?: readonly CompanyMercuriale[];
}

function grid(world: World = {}) {
  const services = gridServices(NOW, world);
  const mercuriales = new RecordingMercuriales(world.mercuriales ?? []);
  const shelf = new GivenShelf([...PRICES].map(([sku, price]) => shelfArticle(sku, price)));
  const history = new Map(
    [...PRICES].map(([sku, unitPriceMillicents]) => [
      sku,
      { sku, unitPriceMillicents, vatRatePercent: 5.5 },
    ]),
  );
  const handler = new ExportPriceGridHandler(
    services.contexts,
    services.promotions,
    shelf,
    realPricer(NOW, mercuriales, linePromotionSupply(world.lines ?? []), history),
    new FixedLineClassifications(),
  );
  return { handler, mercuriales, shelf };
}

function payload(overrides: Partial<PriceGridExportPayload> = {}): PriceGridExportPayload {
  return {
    audience: { kind: "individuals_registered" },
    day: null,
    fulfillment: { method: "pickup", pickupId: PICKUP },
    basketPromotions: [],
    pricePerKg: false,
    ...overrides,
  };
}

/** Les lignes du fichier, sans BOM. */
function linesOf(csv: string): readonly string[] {
  return csv.slice(CSV_BOM.length).split("\r\n");
}

/** La ligne d'un SKU, découpée en cellules. */
function cellsOf(csv: string, sku: string): readonly string[] {
  const line = linesOf(csv).find((entry) => entry.includes(`"${sku}"`)) ?? "";
  return line.split(";");
}

function euros(cents: number): string {
  return `${String(Math.trunc(cents / 100))},${String(cents % 100).padStart(2, "0")}`;
}

describe("exporter une grille de prix", () => {
  it("un particulier lit des TTC, sans société ni mercuriale", async () => {
    const { handler, mercuriales } = grid();

    const file = await handler.execute(new ExportPriceGridQuery(payload()));

    expect(file.fileName).toBe(`grille-particuliers-inscrits-${TODAY}.csv`);
    expect(linesOf(file.csv)[3]).toContain("Prix TTC");
    expect(cellsOf(file.csv, CROISSANT)[6]).toBe(euros(ttcCentsFromHtMillicents(150_000, 5.5)));
    expect(mercuriales.asked.every((entry) => entry.companyId === null)).toBe(true);
  });

  it("un pro lit des HT ; sans mercuriale, le prix affiché est le tarif", async () => {
    const { handler } = grid();

    const file = await handler.execute(
      new ExportPriceGridQuery(payload({ audience: { kind: "company", companyId: COMPANY } })),
    );

    expect(file.fileName).toBe(`grille-la-folie-${TODAY}.csv`);
    expect(linesOf(file.csv)[3]).toContain("Prix HT");
    expect(cellsOf(file.csv, CROISSANT).slice(5, 8)).toEqual(["1,50", "1,50", "1,50"]);
  });

  it("une promotion du prix affiché est dans le prix, et nommée en tête", async () => {
    const tenPercent = livePromotion({
      id: "ligne",
      label: "−10 % pour tous",
      effect: { kind: "percent_off", basisPoints: 1000 },
    });
    const { handler } = grid({ lines: [tenPercent] });

    const file = await handler.execute(
      new ExportPriceGridQuery(payload({ audience: { kind: "company", companyId: COMPANY } })),
    );

    expect(linesOf(file.csv)[4]).toContain("−10 % pour tous");
    expect(cellsOf(file.csv, CROISSANT).slice(5, 7)).toEqual(["1,50", "1,35"]);
  });

  it("une remise de panier en colonne, une au net estimé, une ignorée", async () => {
    const { handler } = grid({
      basket: [
        basketPromotion("col"),
        basketPromotion("net", { effect: { kind: "percent_off", basisPoints: 1000 } }),
        basketPromotion("ign"),
      ],
    });

    const file = await handler.execute(
      new ExportPriceGridQuery(
        payload({
          audience: { kind: "company", companyId: COMPANY },
          basketPromotions: [
            { promotionId: "col", part: "column" },
            { promotionId: "net", part: "net" },
            { promotionId: "ign", part: "ignored" },
          ],
        }),
      ),
    );

    expect(linesOf(file.csv)[5]).toContain("Panier ign (ignorée)");
    expect(linesOf(file.csv)[8]).toContain('"Panier col (remise au panier)";"Prix net estimé HT"');
    // Colonne : « 20 % » ; net : 1,50 − 10 % = 1,35.
    expect(cellsOf(file.csv, CROISSANT).slice(7)).toEqual(['"20 %"', "1,35"]);
  });

  it("un article exclu d'une remise en colonne : cellule vide", async () => {
    const { handler } = grid({
      basket: [
        basketPromotion("col", {
          scope: {
            mode: "all_except",
            rules: [{ target: "variant", targetId: PAIN, eligible: false, targetRank: null }],
          },
        }),
      ],
    });

    const file = await handler.execute(
      new ExportPriceGridQuery(
        payload({ basketPromotions: [{ promotionId: "col", part: "column" }] }),
      ),
    );

    expect(cellsOf(file.csv, PAIN)[7]).toBe("");
    expect(cellsOf(file.csv, CROISSANT)[7]).toBe('"20 %"');
  });

  describe("une société sous mercuriale", () => {
    it("« Aucune » : la remise ne touche pas l'article négocié", async () => {
      const { handler } = grid({
        basket: [basketPromotion("col")],
        mercuriales: [mercurialeOn(CROISSANT, 120_000, { mode: "none", promotionIds: [] })],
      });

      const file = await handler.execute(
        new ExportPriceGridQuery(
          payload({
            audience: { kind: "company", companyId: COMPANY },
            basketPromotions: [{ promotionId: "col", part: "column" }],
          }),
        ),
      );

      expect(cellsOf(file.csv, CROISSANT).slice(6)).toEqual(["1,20", "", "1,20"]);
      expect(cellsOf(file.csv, PAIN)[7]).toBe('"20 %"');
    });

    it("« Au choix » : la promotion choisie passe", async () => {
      const { handler } = grid({
        basket: [basketPromotion("col")],
        mercuriales: [
          mercurialeOn(CROISSANT, 120_000, { mode: "selected", promotionIds: ["col"] }),
        ],
      });

      const file = await handler.execute(
        new ExportPriceGridQuery(
          payload({
            audience: { kind: "company", companyId: COMPANY },
            basketPromotions: [{ promotionId: "col", part: "column" }],
          }),
        ),
      );

      expect(cellsOf(file.csv, CROISSANT)[7]).toBe('"20 %"');
    });
  });

  it("refuse une remise cochée que ce public ne reçoit pas", async () => {
    const proOnly = basketPromotion("pros", { audiences: [{ kind: "pros" }] });
    const { handler } = grid({ basket: [proOnly] });

    await expect(
      handler.execute(
        new ExportPriceGridQuery(
          payload({ basketPromotions: [{ promotionId: "pros", part: "column" }] }),
        ),
      ),
    ).rejects.toBeInstanceOf(PriceGridPromotionNotApplicableError);
  });

  describe("la date", () => {
    it("aujourd'hui choisi = maintenant : aucune relecture", async () => {
      const { handler, mercuriales } = grid();

      await handler.execute(
        new ExportPriceGridQuery(
          payload({ audience: { kind: "company", companyId: COMPANY }, day: TODAY }),
        ),
      );

      expect(mercuriales.asked.some((entry) => entry.replay)).toBe(false);
    });

    it("un jour passé pour un pro : la porte relit les décisions d'alors", async () => {
      const { handler, mercuriales } = grid();

      const file = await handler.execute(
        new ExportPriceGridQuery(
          payload({ audience: { kind: "company", companyId: COMPANY }, day: YESTERDAY }),
        ),
      );

      expect(mercuriales.asked.some((entry) => entry.replay)).toBe(true);
      expect(file.fileName).toBe(`grille-la-folie-${YESTERDAY}.csv`);
    });

    it("un jour passé pour un particulier est refusé : l'historique n'a que le tarif pro", async () => {
      const { handler } = grid();

      await expect(
        handler.execute(new ExportPriceGridQuery(payload({ day: YESTERDAY }))),
      ).rejects.toBeInstanceOf(PriceGridDatedPublicError);
    });

    it("un jour à venir : une remise qui ne commence qu'alors y est retenue", async () => {
      const later = basketPromotion("bientot", { validFrom: new Date("2030-02-01T00:00:00.000Z") });
      const { handler, shelf } = grid({ basket: [later] });

      const file = await handler.execute(
        new ExportPriceGridQuery(
          payload({
            day: NEXT_MONTH,
            basketPromotions: [{ promotionId: "bientot", part: "column" }],
          }),
        ),
      );

      expect(linesOf(file.csv)[1]).toContain("15/02/2030");
      expect(shelf.asked[0]?.at.getTime()).toBeGreaterThan(NOW.getTime());
    });
  });

  it("refuse une société inconnue, et un point de retrait inconnu", async () => {
    const { handler } = grid();

    await expect(
      handler.execute(
        new ExportPriceGridQuery(payload({ audience: { kind: "company", companyId: "co_x" } })),
      ),
    ).rejects.toBeInstanceOf(PriceGridCompanyNotFoundError);
    await expect(
      handler.execute(
        new ExportPriceGridQuery(payload({ fulfillment: { method: "pickup", pickupId: "pt_x" } })),
      ),
    ).rejects.toBeInstanceOf(PriceGridPickupNotFoundError);
  });
});
