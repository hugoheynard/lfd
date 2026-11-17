import type { CatalogFamilyView } from "@lfd/contracts";

import { pdfPages } from "../../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { ProductionArticle } from "../../../../channels/commerce/production-articles.reader.js";
import { WorkshopShelvesReader } from "../../../../channels/commerce/workshop-shelves.reader.js";
import { CapturedLogs } from "../../../../shared/print/application/__tests__/captured-logs.js";
import { FixedPaperLogo } from "../../../../shared/print/application/__tests__/paper-logo-doubles.js";
import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { ProductionDisplaySettings } from "../../../../shared/print/index.js";
import {
  FailingWorkstationOfProducts,
  FixedProductionArticles,
  FixedWorkstationOfProducts,
  UnreadWorkstationOfProducts,
  article,
} from "../../../../workstations/application/__tests__/placement-doubles.js";
import type { WorkstationOfProducts } from "../../../../workstations/index.js";
import { SIMULATION_MARK } from "../../../domain/services/production-simulation-pdf.js";
import { SimulationGroupingUnreadableError } from "../../../domain/errors/production-simulation-errors.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import { GetProductionSimulationPdfHandler } from "../get-production-simulation-pdf.handler.js";
import { GetProductionSimulationPdfQuery } from "../get-production-simulation-pdf.query.js";
import { GetProductionSimulationSpecimenHandler } from "../get-production-simulation-specimen.handler.js";

/**
 * **La simulation du catalogue** (plan `fournil/plan-postes-du-fournil.md`,
 * § 3.11) : chaque article vendable ressort une fois, déclinaisons comprises,
 * dans le mode demandé quel que soit le réglage, et rien n'est écrit.
 */
/** Le texte du PDF relu en latin1 : le tiret cadratin WinAnsi (0x97) y redevient « — ». */
function pagesOf(bytes: Parameters<typeof pdfPages>[0]): readonly string[] {
  return pdfPages(bytes).map((page) => page.replaceAll("\u0097", "—"));
}

const SALTY: CatalogFamilyView = { id: "fam-salty", name: "Traiteur salé", position: 1 };
const BREADS: CatalogFamilyView = { id: "fam-breads", name: "Pains", position: 2 };

function named(base: ProductionArticle, variantName: string, sellable = true): ProductionArticle {
  return { ...base, variantName, sellable };
}

const QUICHE_8 = named(article("QUI-8", "QUI", SALTY), "Quiche lorraine — 8 parts");
const QUICHE_6 = named(article("QUI-6", "QUI", SALTY), "Quiche lorraine — 6 parts");
const BAGUETTE = named(article("BAG", "BAG", BREADS), "Baguette tradition");
const UNSOLD = named(article("OLD", "OLD", BREADS), "Pain retiré du rayon", false);
const CATALOGUE = [QUICHE_8, QUICHE_6, BAGUETTE, UNSOLD];

/** Les rayons du mode boutique ; retient chaque demande. */
class Shelves extends WorkshopShelvesReader {
  readonly asked: (readonly string[])[] = [];
  shelvesOf(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogFamilyView>> {
    this.asked.push(skus);
    const shelves = new Map<string, CatalogFamilyView>();
    for (const item of CATALOGUE.filter((candidate) => skus.includes(candidate.sku))) {
      shelves.set(item.sku, item.family);
    }
    return Promise.resolve(shelves);
  }
}

/** Le réglage en vigueur est le mode boutique : la simulation ne doit pas le suivre. */
function scene(workstations: WorkstationOfProducts = new UnreadWorkstationOfProducts()) {
  const shelves = new Shelves();
  const articles = new FixedProductionArticles(CATALOGUE);
  const settings = new InMemoryDisplaySettings(
    ProductionDisplaySettings.of({ showSubcategories: false, grouping: "shelf" }),
  );
  const handler = new GetProductionSimulationPdfHandler(
    articles,
    new GroupingSourceReading(shelves, articles, workstations),
    settings.reader(),
    new FixedPaperLogo(),
    new FixedClock(new Date()),
  );
  return { handler, shelves, articles, settings };
}

const PASTRY = new FixedWorkstationOfProducts(
  [{ id: "ws_pastry", name: "Pâtisserie", position: 0 }],
  new Map([["QUI", "ws_pastry"]]),
);

describe("GetProductionSimulationPdfHandler — la simulation du catalogue", () => {
  let logs: CapturedLogs;

  beforeEach(() => {
    logs = CapturedLogs.capture();
  });

  afterEach(() => {
    logs.release();
  });

  it("mode boutique : chaque article vendable, déclinaisons comprises, est rangé une fois", async () => {
    const { handler, shelves } = scene();

    const paper = await handler.execute(new GetProductionSimulationPdfQuery("shelf"));
    const text = pagesOf(paper.bytes).join("");

    expect(shelves.asked).toEqual([["QUI-8", "QUI-6", "BAG"]]);
    expect(text).toContain("Quiche lorraine");
    expect(text).toContain("Baguette tradition");
    expect(text).not.toContain("Pain retiré du rayon");
    expect(text).toContain("Traiteur salé");
    expect(paper.fileName).toBe("simulation-catalogue-shelf.pdf");
  });

  it("mode prod, quel que soit le réglage : rangé par poste, l'article sans poste nommé « à ranger »", async () => {
    const { handler, shelves, articles } = scene(PASTRY);

    const paper = await handler.execute(new GetProductionSimulationPdfQuery("workstation"));
    const text = pagesOf(paper.bytes).join("");

    expect(shelves.asked).toEqual([]);
    expect(articles.asked).toEqual([["QUI-8", "QUI-6", "BAG"]]);
    expect(text).toContain("Pâtisserie");
    expect(text).toContain("Pains — à ranger");
    expect(text).toContain("2 lignes");
    expect(text).toContain("1 article");
  });

  it("chaque page porte la mention de simulation", async () => {
    const { handler } = scene(PASTRY);

    const paper = await handler.execute(new GetProductionSimulationPdfQuery("workstation"));
    const pages = pagesOf(paper.bytes);

    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page).toContain(SIMULATION_MARK);
    }
  });

  it("rien n'est écrit : le réglage reste en mode boutique, et aucun port d'écriture n'est injecté", async () => {
    const { handler, settings } = scene(PASTRY);

    await handler.execute(new GetProductionSimulationPdfQuery("workstation"));

    expect(settings.writes).toEqual([]);
    expect(settings.posed?.grouping).toBe("shelf");
    const injected: unknown = Reflect.getMetadata(
      "design:paramtypes",
      GetProductionSimulationPdfHandler,
    );
    const names = Array.isArray(injected)
      ? injected.map((type: unknown) => (typeof type === "function" ? type.name : String(type)))
      : [];
    expect(names).toEqual([
      "ProductionArticlesReader",
      "GroupingSourceReading",
      "ProductionDisplaySettingsReader",
      "BrandLogoSource",
      "Clock",
    ]);
  });

  it("postes illisibles : refusée, plutôt que rangée par rayon sous le titre du mode prod", async () => {
    const { handler } = scene(new FailingWorkstationOfProducts());

    await expect(
      handler.execute(new GetProductionSimulationPdfQuery("workstation")),
    ).rejects.toBeInstanceOf(SimulationGroupingUnreadableError);
  });
});

describe("GetProductionSimulationSpecimenHandler — l'exemple de la planche", () => {
  it("rend deux postes, un article à ranger et un hors catalogue", async () => {
    const handler = new GetProductionSimulationSpecimenHandler(
      new FixedClock(new Date()),
      new FixedPaperLogo(),
    );

    const paper = await handler.execute();
    const text = pagesOf(paper.bytes).join("");

    expect(text).toContain("EXEMPLE — Boulangerie");
    expect(text).toContain("Pain au chocolat");
    expect(text).toContain("Hors catalogue — à ranger");
    expect(text).toContain(SIMULATION_MARK);
  });
});
