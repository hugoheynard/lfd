import type { PriceGridExportPayload, PriceGridQuestion } from "@lfd/contracts";

import { CSV_BOM } from "../../../../../platform/csv/csv-cells.js";
import { PRO_ANONYMOUS_VIEWER } from "../../../../catalog/domain/catalog-viewer.js";
import { FixedLineClassifications } from "../../../../orders/domain/ports/__tests__/line-classification-doubles.js";
import { linePromotionSupply } from "../../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import type { PromotionAudience } from "../../../../promotions/domain/promotion-audience.js";
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
import { ListPriceGridPromotionsHandler } from "../list-price-grid-promotions.handler.js";
import { ListPriceGridPromotionsQuery } from "../list-price-grid-promotions.query.js";

/**
 * **Le pro type de la grille** (`export-grille-de-prix.md`, § 6) : aucune
 * société, ses faits d'audience déclarés, le lecteur pro anonyme — tarif pro
 * HT, sans mercuriale. Dates comparées à la seule horloge figée.
 */

const NOW = new Date("2030-01-15T09:00:00.000Z");
const CROISSANT = "VIE-001-1";
const PRO_PRICE = 150_000;

const AT_PICKUP = { kind: "basket", pickup: "all", delivery: "none" } as const;

/** Une promotion de ligne −10 %, et une de panier au retrait, pour ce public. */
function pair(id: string, audience: PromotionAudience): readonly LivePromotion[] {
  return [
    livePromotion({
      id: `ligne_${id}`,
      label: `Ligne ${id}`,
      audience,
      effect: { kind: "percent_off", basisPoints: 1000 },
    }),
    livePromotion({ id: `panier_${id}`, label: `Panier ${id}`, audience, fulfillment: AT_PICKUP }),
  ];
}

const PROMOTIONS = [
  ...pair("actifs", { kind: "pros_active" }),
  ...pair("en_attente", { kind: "pros_pending" }),
  ...pair("particuliers", { kind: "individuals" }),
  ...pair("societe", { kind: "company", companyId: COMPANY }),
];
const LINES = PROMOTIONS.filter((promotion) => promotion.id.startsWith("ligne_"));
const BASKET = PROMOTIONS.filter((promotion) => promotion.id.startsWith("panier_"));

function grid() {
  const services = gridServices(NOW, { lines: LINES, basket: BASKET });
  // Une mercuriale posée pour une société réelle : un pro type ne la lit jamais.
  const mercuriales = new RecordingMercuriales([
    mercurialeOn(CROISSANT, 90_000, { mode: "all", promotionIds: [] }),
  ]);
  const shelf = new GivenShelf([shelfArticle(CROISSANT, PRO_PRICE)]);
  const handler = new ExportPriceGridHandler(
    services.contexts,
    services.promotions,
    shelf,
    realPricer(NOW, mercuriales, linePromotionSupply(LINES)),
    new FixedLineClassifications(),
  );
  return {
    handler,
    list: new ListPriceGridPromotionsHandler(services.contexts, services.promotions),
    mercuriales,
    shelf,
  };
}

function question(kind: "pro_active" | "pro_pending"): PriceGridQuestion {
  return { audience: { kind }, day: null, fulfillment: { method: "pickup", pickupId: PICKUP } };
}

function payload(kind: "pro_active" | "pro_pending"): PriceGridExportPayload {
  return { ...question(kind), basketPromotions: [], pricePerKg: false };
}

function cellsOf(csv: string): readonly string[] {
  const line = csv
    .slice(CSV_BOM.length)
    .split("\r\n")
    .find((entry) => entry.includes(CROISSANT));
  return (line ?? "").split(";");
}

describe("la grille d'un pro type", () => {
  it("« Pros (société active) » : tarif pro HT, lecteur pro anonyme, aucune mercuriale", async () => {
    const { handler, mercuriales, shelf } = grid();

    const file = await handler.execute(new ExportPriceGridQuery(payload("pro_active")));

    expect(file.csv).toContain("Prix HT");
    expect(shelf.asked.map((entry) => entry.viewer)).toEqual([PRO_ANONYMOUS_VIEWER]);
    expect(mercuriales.asked.every((entry) => entry.companyId === null)).toBe(true);
    // Tarif 1,50 HT ; seule la promotion « pros actifs » baisse le prix affiché.
    expect(cellsOf(file.csv).slice(5, 7)).toEqual(["1,50", "1,35"]);
    expect(file.csv).toContain("Ligne actifs");
    expect(file.csv).not.toContain("Ligne particuliers");
    expect(file.csv).not.toContain("Ligne societe");
  });

  it("dit ses limites, la remarque « mêmes prix, promotions différentes » et sa lentille", async () => {
    const { handler } = grid();

    const file = await handler.execute(new ExportPriceGridQuery(payload("pro_pending")));

    expect(file.csv).toContain("Grille de prix — Pros en cours d'inscription");
    expect(file.csv).toContain(
      "hors conditions négociées, hors remises réservées à une société et ses sites, " +
        "hors articles réservés, hors remises jugées au créneau",
    );
    expect(file.csv).toContain("mêmes prix, promotions différentes");
    expect(file.csv).toContain("Projection");
  });

  it("une société précise dit, elle, son prix réel", async () => {
    const { handler } = grid();

    const file = await handler.execute(
      new ExportPriceGridQuery({
        ...payload("pro_active"),
        audience: { kind: "company", companyId: COMPANY },
      }),
    );

    expect(file.csv).toContain("Prix réel de cette société");
    expect(file.csv).not.toContain("Projection");
  });

  it.each([
    ["pro_active", ["panier_actifs"], ["ligne_actifs"]],
    ["pro_pending", ["panier_en_attente"], ["ligne_en_attente"]],
  ] as const)(
    "%s : mêmes faits pour la ligne et le panier, jamais « particuliers » ni une société",
    async (kind, basket, displayed) => {
      const { list } = grid();

      const view = await list.execute(new ListPriceGridPromotionsQuery(question(kind)));

      expect(view.basis).toBe("ht");
      expect(view.basket.map((promotion) => promotion.id)).toEqual(basket);
      expect(view.displayedPrice.map((promotion) => promotion.id)).toEqual(displayed);
    },
  );
});
